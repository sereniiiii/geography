/* ============================================================
   store.js —— 用户数据与快照（纯静态，无后端）
   静态内容在 data/content.js / data/views.js / data/timeline.js；
   这里只碰 localStorage，内容与用户数据严格分离。
   ============================================================ */
(function (global) {
  var KEY_USER = 'gg.user.v1';
  var KEY_SNAP = 'gg.snapshots.v1';
  var SCHEMA = 'geography-study-hub/v1';
  var MAX_SNAPSHOTS = 6;

  function emptyUser() {
    return {
      version: 1,
      notes: {},      // id -> { text, updatedAt }
      reviews: {},    // id -> ['YYYY-MM-DD', ...]
      status: {},     // id -> { state: 'mastered' | 'review', updatedAt }
      customs: [],    // 自定义考点
      timeline: [],   // 自定义时间线事件
      config: { lastBackup: null, expanded: {} },
      updatedAt: Date.now()
    };
  }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function cleanTimeline(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (e) {
      return e && typeof e.id === 'string' && typeof e.title === 'string' &&
        typeof e.y === 'number' && isFinite(e.y);
    });
  }

  function loadUser() {
    var u = safeParse(localStorage.getItem(KEY_USER), null);
    var base = emptyUser();
    if (!u || typeof u !== 'object') return base;
    return {
      version: 1,
      notes: u.notes && typeof u.notes === 'object' ? u.notes : {},
      reviews: u.reviews && typeof u.reviews === 'object' ? u.reviews : {},
      status: u.status && typeof u.status === 'object' ? u.status : {},
      customs: Array.isArray(u.customs) ? u.customs : [],
      timeline: cleanTimeline(u.timeline),
      config: Object.assign(base.config, u.config || {}),
      updatedAt: u.updatedAt || Date.now()
    };
  }

  function saveUser(u) {
    u.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY_USER, JSON.stringify(u));
      global.dispatchEvent(new CustomEvent('gg:user-saved', { detail: { updatedAt: u.updatedAt } }));
      return true;
    } catch (e) {
      console.warn('保存失败（可能超出本地存储配额）', e);
      return false;
    }
  }

  function listSnapshots() {
    var arr = safeParse(localStorage.getItem(KEY_SNAP), []);
    return Array.isArray(arr) ? arr : [];
  }

  function takeSnapshot(u, reason) {
    var arr = listSnapshots();
    var snap = {
      id: 'S' + Date.now() + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      reason: reason || '手动快照',
      counts: {
        notes: Object.keys(u.notes || {}).length,
        customs: (u.customs || []).length,
        timeline: (u.timeline || []).length,
        reviewDays: new Set(Object.keys(u.reviews || {}).flatMap(function (k) {
          return Array.isArray(u.reviews[k]) ? u.reviews[k] : [];
        })).size
      },
      data: JSON.parse(JSON.stringify({
        notes: u.notes, reviews: u.reviews, status: u.status,
        customs: u.customs, timeline: u.timeline, config: u.config, version: 1
      }))
    };
    arr.unshift(snap);
    var keep = arr.slice(0, MAX_SNAPSHOTS);
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        localStorage.setItem(KEY_SNAP, JSON.stringify(keep));
        return snap;
      } catch (e) {
        keep.pop();
        if (!keep.length) return null;
      }
    }
    return null;
  }

  function restoreSnapshot(id) {
    var arr = listSnapshots();
    var snap = arr.filter(function (s) { return s.id === id; })[0];
    return snap ? JSON.parse(JSON.stringify(snap.data)) : null;
  }

  function exportPayload(u) {
    return {
      schema: SCHEMA,
      app: '地理知识库',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        notes: u.notes, reviews: u.reviews, status: u.status,
        customs: u.customs, timeline: u.timeline, config: u.config
      }
    };
  }

  function validateImport(obj) {
    if (!obj || typeof obj !== 'object') return '文件不是 JSON 对象';
    if (obj.schema !== SCHEMA) return '不是本工具导出的备份（schema 不匹配：需要 ' + SCHEMA + '）';
    var d = obj.data;
    if (!d || typeof d !== 'object') return '备份缺少 data 字段';
    if (d.notes && typeof d.notes !== 'object') return 'notes 字段格式错误';
    if (d.status && typeof d.status !== 'object') return 'status 字段格式错误';
    if (d.reviews && typeof d.reviews !== 'object') return 'reviews 字段格式错误';
    if (d.customs && !Array.isArray(d.customs)) return 'customs 字段格式错误';
    if (d.timeline && !Array.isArray(d.timeline)) return 'timeline 字段格式错误';
    var keys = Object.keys(d.status || {});
    for (var i = 0; i < keys.length; i++) {
      var s = d.status[keys[i]];
      if (s && s.state && s.state !== 'mastered' && s.state !== 'review') {
        return '状态值非法：' + s.state + '（只接受 mastered / review）';
      }
    }
    var customs = d.customs || [];
    for (var j = 0; j < customs.length; j++) {
      var c = customs[j];
      if (!c || typeof c.id !== 'string' || typeof c.title !== 'string') {
        return '自定义考点缺少 id 或 title（第 ' + (j + 1) + ' 条）';
      }
    }
    var tl = d.timeline || [];
    for (var k = 0; k < tl.length; k++) {
      var e = tl[k];
      if (!e || typeof e.id !== 'string' || typeof e.title !== 'string' || typeof e.y !== 'number') {
        return '自定义时间线事件缺少 id / title / 年份（第 ' + (k + 1) + ' 条）';
      }
    }
    return '';
  }

  function newer(a, b) {
    return (a && a.updatedAt || 0) >= (b && b.updatedAt || 0) ? a : b;
  }

  function mergeUser(local, incoming) {
    var out = JSON.parse(JSON.stringify(local));
    var inc = incoming || {};
    out.notes = out.notes || {};
    Object.keys(inc.notes || {}).forEach(function (k) {
      if (!/^[\w\-:.]+$/.test(k)) return;
      out.notes[k] = newer(out.notes[k], inc.notes[k]);
    });
    out.reviews = out.reviews || {};
    Object.keys(inc.reviews || {}).forEach(function (k) {
      if (!/^[\w\-:.]+$/.test(k) || !Array.isArray(inc.reviews[k])) return;
      var dates = new Set([].concat(out.reviews[k] || [], inc.reviews[k].filter(function (x) {
        return /^\d{4}-\d{2}-\d{2}$/.test(x);
      })));
      if (dates.size) out.reviews[k] = Array.from(dates).sort();
    });
    out.status = out.status || {};
    Object.keys(inc.status || {}).forEach(function (k) {
      if (!/^[\w\-:.]+$/.test(k)) return;
      out.status[k] = newer(out.status[k], inc.status[k]);
    });
    var mergeList = function (cur, add) {
      var map = new Map((cur || []).map(function (x) { return [x.id, x]; }));
      (add || []).forEach(function (x) {
        if (!x || typeof x.id !== 'string') return;
        var old = map.get(x.id);
        map.set(x.id, old ? newer(old, x) : x);
      });
      return Array.from(map.values());
    };
    out.customs = mergeList(out.customs, inc.customs);
    out.timeline = mergeList(out.timeline, cleanTimeline(inc.timeline));
    out.config = Object.assign({}, out.config || {}, inc.config || {});
    out.config.lastBackup = Math.max(out.config.lastBackup || 0, (inc.config && inc.config.lastBackup) || 0) || null;
    out.updatedAt = Date.now();
    return out;
  }

  function overwriteUser(incoming) {
    var out = emptyUser();
    out.notes = incoming.notes || {};
    out.reviews = incoming.reviews || {};
    out.status = incoming.status || {};
    out.customs = incoming.customs || [];
    out.timeline = cleanTimeline(incoming.timeline);
    out.config = Object.assign(out.config, incoming.config || {});
    return out;
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  var csvCell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };

  function notesToCSV(items, user) {
    var head = ['数据类型', 'ID', '标题', '教材', '章节 / 年份', '状态', '标记日期', '复习次数', '最近复习', '笔记 / 说明'];
    var rows = items.map(function (p) {
      var st = user.status[p.id] || {};
      var rev = user.reviews[p.id] || [];
      return [
        '考点', p.id, p.title, (p.bookName || '') + ' ' + (p.bookTitle || ''),
        (p.unitNo || '') + ' ' + (p.unitTitle || '') + ' · ' + (p.lessonNo || '') + ' ' + (p.lessonTitle || ''),
        st.state === 'mastered' ? '已掌握' : (st.state === 'review' ? '待复习' : '未标记'),
        st.updatedAt ? new Date(st.updatedAt).toLocaleDateString('zh-CN') : '',
        rev.length, rev.length ? rev[rev.length - 1] : '',
        (user.notes[p.id] && user.notes[p.id].text) || ''
      ];
    });
    (user.timeline || []).forEach(function (e) {
      rows.push(['时间线事件', e.id, e.title, '地理学发展年表', e.year || String(e.y), '', '', '', '', e.summary || '']);
    });
    return '\ufeff' + [head].concat(rows).map(function (r) {
      return r.map(csvCell).join(',');
    }).join('\r\n');
  }

  function knowledgeToMD(items, user) {
    var groups = new Map();
    items.forEach(function (p) {
      var k = (p.bookName || '') + ' ' + (p.bookTitle || '') + ' · ' + (p.unitNo || '') + ' ' + (p.unitTitle || '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    var md = '# 地理考点导出\n\n导出时间：' + new Date().toLocaleString('zh-CN') + '\n\n';
    groups.forEach(function (arr, g) {
      md += '## ' + g + '\n\n';
      arr.forEach(function (p) {
        md += '### ' + p.title + '\n\n' + (p.summary || '') + '\n\n';
        (p.core || []).forEach(function (c) { md += '- ' + c + '\n'; });
        if (p.pitfall) md += '\n**易错**：' + p.pitfall + '\n';
        if (p.exam) md += '\n**考法**：' + p.exam + '\n';
        var note = user.notes[p.id] && user.notes[p.id].text;
        if (note) md += '\n**我的笔记**：' + note + '\n';
        md += '\n';
      });
    });
    if ((user.timeline || []).length) {
      md += '## 地理学发展年表 · 自定义事件\n\n';
      user.timeline.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (e) {
        md += '- ' + (e.year || e.y) + ' · ' + e.title + '（' + (e.region || '中国') + '）' + (e.summary ? '：' + e.summary : '') + '\n';
      });
    }
    return md;
  }

  global.GGStore = {
    KEY_USER: KEY_USER,
    emptyUser: emptyUser,
    loadUser: loadUser,
    saveUser: saveUser,
    listSnapshots: listSnapshots,
    takeSnapshot: takeSnapshot,
    restoreSnapshot: restoreSnapshot,
    exportPayload: exportPayload,
    validateImport: validateImport,
    mergeUser: mergeUser,
    overwriteUser: overwriteUser,
    download: download,
    stamp: stamp,
    notesToCSV: notesToCSV,
    knowledgeToMD: knowledgeToMD
  };
})(window);
