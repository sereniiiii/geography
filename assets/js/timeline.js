/* ============================================================
   timeline.js —— 地理学发展年表：中国与世界同轴
   数据：data/timeline.js（只读）；自定义事件存 localStorage
   ============================================================ */
(function () {
  var GG = window.GG, TL = window.GGTimeline, S = window.GGStore, R = window.GGRender;
  if (!TL || !S || !R) { console.error('时间线依赖未加载'); return; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var dateStr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var TODAY = dateStr(new Date());

  var user = S.loadUser();
  var stages = TL.stages;
  var stageMap = {};
  stages.forEach(function (s) { stageMap[s.key] = s; });

  var RELATED = {
    'tl-c6': 'g3c7-1',
    'tl-w5': 'g3c7-1',
    'tl-w7': 'g3c11-1',
    'tl-w9': 'g3c9-1',
    'tl-w10': 'g3c9-1',
    'tl-w12': 'g3c4-2',
    'tl-w13': 'g3c6-1',
    'tl-w14': 'g1c17-1',
    'tl-w15': 'g3c4-2',
    'tl-w16': 'g2c12-1',
    'tl-w17': 'g1c17-1',
    'tl-w18': 'g5c10-1',
    'tl-w19': 'g2c13-1',
    'tl-w20': 'g5c10-1',
    'tl-c16': 'g3c4-2',
    'tl-c17': 'g5c4-1',
    'tl-w21': 'g2c3-1',
    'tl-c15': 'g1c17-1',
    'tl-c14': 'g5c6-1',
    'tl-c9': 'g3c7-2'
  };

  var itemIndex = {};
  (GG.items || []).forEach(function (it) { itemIndex[it.id] = it; });

  var state = { q: '', region: '全部', stage: 'all' };

  function stageOf(y) {
    if (y < 1500) return 'ancient';
    if (y < 1900) return 'voyage';
    if (y < 1950) return 'modern';
    return 'contemporary';
  }

  function formatYear(y) {
    if (y < 0) return '公元前 ' + (-y) + ' 年';
    return y + ' 年';
  }

  function stageLabel(k) { return (stageMap[k] && stageMap[k].label) || k; }
  function stageColor(k) { return (stageMap[k] && stageMap[k].color) || '#6f7a3f'; }

  function allEvents() {
    var base = TL.events.map(function (e) { return Object.assign({}, e); });
    var custom = (user.timeline || []).map(function (e) {
      return {
        id: e.id, y: e.y, year: e.year || formatYear(e.y),
        region: e.region || '中国', stage: e.stage || stageOf(e.y),
        title: e.title, summary: e.summary || '', tag: e.tag || '自定义',
        custom: true, createdAt: e.createdAt
      };
    });
    var rel = {};
    base.concat(custom).forEach(function (e) {
      if (RELATED[e.id]) rel[e.id] = RELATED[e.id];
    });
    base.forEach(function (e) { if (rel[e.id]) e.related = rel[e.id]; });
    custom.forEach(function (e) { if (rel[e.id]) e.related = rel[e.id]; });
    return base.concat(custom).sort(function (a, b) {
      return a.y - b.y || String(a.id).localeCompare(String(b.id));
    });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var toks = q ? q.split(/\s+/).filter(Boolean) : [];
    return allEvents().filter(function (e) {
      if (state.region !== '全部' && e.region !== state.region) return false;
      if (state.stage !== 'all' && e.stage !== state.stage) return false;
      if (!toks.length) return true;
      var hay = [e.title, e.summary, e.year, e.tag, e.region, stageLabel(e.stage)].join(' ').toLowerCase();
      return toks.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    var all = allEvents();
    var cn = all.filter(function (e) { return e.region === '中国'; }).length;
    var wd = all.filter(function (e) { return e.region === '世界'; }).length;
    var cu = all.filter(function (e) { return e.custom; }).length;
    var html = '<span class="tl-stat"><strong>' + all.length + '</strong> 事件</span>' +
      '<span class="tl-stat"><strong>' + cn + '</strong> 中国</span>' +
      '<span class="tl-stat"><strong>' + wd + '</strong> 世界</span>' +
      '<span class="tl-stat"><strong>' + cu + '</strong> 自定义</span>' +
      '<span class="tl-stat">跨越 ' + (all.length ? Math.abs(all[all.length - 1].y - all[0].y) : 0) + ' 年</span>';
    $('#tlStats').innerHTML = html;
  }

  /* ---------- 筛选条 ---------- */
  function renderChips() {
    var all = allEvents();
    var regionCounts = { '全部': all.length, '中国': 0, '世界': 0 };
    var stageCounts = { all: all.length };
    all.forEach(function (e) {
      regionCounts[e.region] = (regionCounts[e.region] || 0) + 1;
      stageCounts[e.stage] = (stageCounts[e.stage] || 0) + 1;
    });

    var rrow = $('#regionRow');
    var rhtml = '<span class="tl-filter-label">地区</span>';
    ['全部', '中国', '世界'].forEach(function (r) {
      rhtml += '<button class="tl-chip' + (state.region === r ? ' active' : '') + '" data-region="' + r + '" aria-pressed="' + (state.region === r) + '">' +
        R.esc(r) + ' <span style="opacity:.72">' + (regionCounts[r] || 0) + '</span></button>';
    });
    rrow.innerHTML = rhtml;

    var srow = $('#stageRow');
    var shtml = '<span class="tl-filter-label">阶段</span>' +
      '<button class="tl-chip' + (state.stage === 'all' ? ' active' : '') + '" data-stage="all" aria-pressed="' + (state.stage === 'all') + '">全部 <span style="opacity:.72">' + stageCounts.all + '</span></button>';
    stages.forEach(function (s) {
      shtml += '<button class="tl-chip' + (state.stage === s.key ? ' active' : '') + '" data-stage="' + s.key + '" aria-pressed="' + (state.stage === s.key) + '">' +
        '<span class="sw" style="background:' + s.color + '"></span>' + R.esc(s.label) +
        ' <span style="opacity:.72">' + (stageCounts[s.key] || 0) + '</span></button>';
    });
    srow.innerHTML = shtml;
  }

  /* ---------- 列表 ---------- */
  function cardHTML(e) {
    var rel = e.related && itemIndex[e.related];
    var meta = '<span class="tl-badge-region">' + R.esc(e.region) + '</span>' +
      '<span class="tl-badge-stage">' + R.esc(stageLabel(e.stage)) + '</span>' +
      (e.custom ? '<span class="tl-badge-custom">自定义</span>' : '');
    return '<div class="tl-item stage-' + R.esc(e.stage) + '" data-id="' + R.esc(e.id) + '">' +
      '<div class="tl-year">' + R.esc(e.year || formatYear(e.y)) + '<small>' + R.esc(e.region) + '</small></div>' +
      '<div class="tl-axis" aria-hidden="true"><span class="tl-dot"></span></div>' +
      '<article class="tl-card">' +
        '<header><h3>' + R.esc(e.title) + '</h3><span class="tl-meta">' + meta + '</span></header>' +
        (e.summary ? '<p>' + R.esc(e.summary) + '</p>' : '') +
        '<div class="tl-foot">' +
          (e.tag ? '<span class="tl-tag">' + R.esc(e.tag) + '</span>' : '') +
          (e.y < 0 ? '<span>公元前</span>' : '') +
          '<span class="tl-actions">' +
            (rel ? '<a href="detail.html?id=' + encodeURIComponent(rel.id) + '" title="' + R.esc(rel.title) + '">查看考点</a>' : '') +
            (e.custom ? '<button class="del" data-del="' + R.esc(e.id) + '">删除</button>' : '') +
          '</span>' +
        '</div>' +
      '</article></div>';
  }

  function render() {
    var list = filtered();
    $('#tlCount').textContent = list.length;
    $('#tlHint').textContent = state.q || state.region !== '全部' || state.stage !== 'all'
      ? '当前为筛选结果 · 点“清除”恢复全部'
      : '按年份升序 · 点“查看考点”回到对应章节';
    $('#tlList').innerHTML = list.map(cardHTML).join('');
    $('#tlEmpty').hidden = list.length > 0;
    renderChips();
    syncURL();
  }

  function syncURL() {
    try {
      var q = [];
      if (state.region !== '全部') q.push('region=' + encodeURIComponent(state.region));
      if (state.stage !== 'all') q.push('stage=' + encodeURIComponent(state.stage));
      if (state.q.trim()) q.push('q=' + encodeURIComponent(state.q.trim()));
      history.replaceState(null, '', 'timeline.html' + (q.length ? '?' + q.join('&') : ''));
    } catch (e) { /* file:// 忽略 */ }
  }

  /* ---------- 弹窗 ---------- */
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.classList.remove('show'); }, 2100);
  }

  function modal(title, body, foot, onMount) {
    var root = $('#modalRoot');
    root.hidden = false;
    root.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + R.esc(title) + '</h3><button class="icon-btn" data-close aria-label="关闭">×</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div>';
    $$('[data-close]', root).forEach(function (b) { b.addEventListener('click', closeModal); });
    root.onclick = function (e) { if (e.target === root) closeModal(); };
    var focusable = root.querySelector('input,select,textarea,button');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);
    if (onMount) onMount(root);
  }

  function closeModal() {
    var root = $('#modalRoot');
    root.hidden = true; root.innerHTML = ''; root.onclick = null;
  }

  /* ---------- 添加自定义事件 ---------- */
  function openAdd() {
    var stageOpts = stages.map(function (s) {
      return '<option value="' + s.key + '">' + R.esc(s.label + '（' + s.range + '）') + '</option>';
    }).join('');
    var body = '<div class="info-note">自定义事件只存在本机浏览器，并会随「JSON 全量备份」一起导出。公元前年份请填负数，例如 <kbd>-300</kbd>。</div>' +
      '<div class="form-grid" style="margin-top:12px">' +
      '<label class="form-field"><span>年份（整数，公元前为负数）</span><input id="teY" type="number" step="1" placeholder="例：1931 或 -300"></label>' +
      '<label class="form-field"><span>地区</span><select id="teRegion"><option>中国</option><option>世界</option></select></label>' +
      '<label class="form-field"><span>阶段</span><select id="teStage">' + stageOpts + '</select></label>' +
      '<label class="form-field"><span>标签</span><input id="teTag" maxlength="20" placeholder="例：考察、地图、气候"></label>' +
      '<label class="form-field full"><span>标题（必填）</span><input id="teTitle" maxlength="60" placeholder="例：某次地理考察"></label>' +
      '<label class="form-field full"><span>说明</span><textarea id="teSummary" maxlength="160" placeholder="一句话说明这件事在地理学上的意义"></textarea></label>' +
      '</div><div class="danger-note" id="teErr" hidden></div>';

    modal('添加时间线事件', body,
      '<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>',
      function (root) {
        var yInput = root.querySelector('#teY');
        var stageSel = root.querySelector('#teStage');
        yInput.addEventListener('input', function () {
          var y = parseInt(yInput.value, 10);
          if (isFinite(y)) stageSel.value = stageOf(y);
        });
        root.querySelector('[data-save]').addEventListener('click', function () {
          var title = root.querySelector('#teTitle').value.trim();
          var summary = root.querySelector('#teSummary').value.trim();
          var tag = root.querySelector('#teTag').value.trim() || '自定义';
          var yv = root.querySelector('#teY').value.trim();
          var y = parseInt(yv, 10);
          var err = '';
          if (!title) err = '标题不能为空';
          else if (!yv || !isFinite(y)) err = '年份必须是整数';
          else if (y === 0) err = '年份不能为 0';
          var box = root.querySelector('#teErr');
          if (err) { box.hidden = false; box.textContent = err; return; }
          var ev = {
            id: 'te-' + Date.now().toString(36),
            y: y, year: formatYear(y),
            region: root.querySelector('#teRegion').value,
            stage: stageSel.value,
            title: title, summary: summary, tag: tag,
            custom: true, createdAt: Date.now(), updatedAt: Date.now()
          };
          user.timeline.push(ev);
          if (!S.saveUser(user)) { toast('保存失败，可能超出本机存储配额'); return; }
          closeModal();
          renderStats(); render();
          toast('已添加：' + title);
        });
      });
  }

  function confirmDelete(id) {
    var ev = (user.timeline || []).filter(function (x) { return x.id === id; })[0];
    if (!ev) return;
    modal('删除自定义事件',
      '<div class="danger-note">将删除「' + R.esc(ev.title) + '」。只影响这一条自定义事件，教材时间线不受影响。</div>',
      '<button class="btn" data-close>取消</button><button class="btn danger" data-do>删除</button>',
      function (root) {
        root.querySelector('[data-do]').addEventListener('click', function () {
          user.timeline = user.timeline.filter(function (x) { return x.id !== id; });
          S.saveUser(user);
          closeModal(); renderStats(); render();
          toast('已删除');
        });
      });
  }

  /* ---------- 导出 ---------- */
  function exportCSV() {
    var list = filtered();
    var head = ['年份', '地区', '阶段', '标题', '说明', '标签', '来源'];
    var rows = list.map(function (e) {
      return [e.year || formatYear(e.y), e.region, stageLabel(e.stage), e.title, e.summary || '', e.tag || '', e.custom ? '自定义' : '内置'];
    });
    var csv = '\ufeff' + [head].concat(rows).map(function (r) {
      return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    S.download('地理学发展年表-' + S.stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('已导出当前 ' + list.length + ' 条事件');
  }

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('gg.theme', t); } catch (e) { }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#081418' : '#f2f1ea');
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var params = new URLSearchParams(location.search);
    var r = params.get('region');
    if (r === '中国' || r === '世界') state.region = r;
    var s = params.get('stage');
    if (s && stageMap[s]) state.stage = s;
    var q = params.get('q');
    if (q) { state.q = q; $('#tlSearch').value = q; }

    renderStats();
    render();

    var timer = null;
    $('#tlSearch').addEventListener('input', function (e) {
      var v = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = v; render(); }, 110);
    });

    $('#regionRow').addEventListener('click', function (e) {
      var b = e.target.closest('[data-region]');
      if (!b) return;
      state.region = b.getAttribute('data-region');
      render();
    });

    $('#stageRow').addEventListener('click', function (e) {
      var b = e.target.closest('[data-stage]');
      if (!b) return;
      state.stage = b.getAttribute('data-stage');
      render();
    });

    $('#tlReset').addEventListener('click', function () {
      state.q = ''; state.region = '全部'; state.stage = 'all';
      $('#tlSearch').value = '';
      render();
    });

    $('#tlList').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { e.preventDefault(); confirmDelete(del.getAttribute('data-del')); }
    });

    $('#addEventBtn').addEventListener('click', openAdd);
    $('#exportBtn').addEventListener('click', exportCSV);

    applyTheme(document.documentElement.dataset.theme || 'light');
    var tt = $('#themeToggle');
    if (tt) tt.addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') {
        if (!$('#modalRoot').hidden) { closeModal(); return; }
        if ($('#tlSearch').value) {
          $('#tlSearch').value = ''; state.q = ''; render();
          if (typing) $('#tlSearch').blur();
          return;
        }
        if (state.region !== '全部' || state.stage !== 'all') {
          state.region = '全部'; state.stage = 'all'; render();
        }
        return;
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); $('#tlSearch').focus(); $('#tlSearch').select(); }
    });

    $('#tlHint').textContent = '按年份升序 · 点“查看考点”回到对应章节';

    window.__TIMELINE_SELFTEST__ = {
      today: TODAY,
      events: function () { return allEvents().length; },
      visible: function () { return filtered().length; },
      custom: function () { return (user.timeline || []).length; },
      state: state,
      add: function (ev) {
        user.timeline.push(Object.assign({ id: 'te-test-' + Date.now(), custom: true, createdAt: Date.now() }, ev));
        S.saveUser(user); renderStats(); render();
      }
    };
  }

  init();
})();
