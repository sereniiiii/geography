/* ============================================================
   sw.js —— Service Worker：主站 / 详情 / 时间线离线可用
   策略：导航请求网络优先（断网回退缓存），静态资源 stale-while-revalidate
   ============================================================ */
const CACHE = 'gg-static-v9';
const CORE = [
  './',
  './index.html',
  './detail.html',
  './timeline.html',
  './assets/css/site.css',
  './assets/css/timeline.css',
  './assets/js/store.js',
  './assets/js/render.js',
  './assets/js/app.js',
  './assets/js/detail.js',
  './assets/js/timeline.js',
  './data/content.js',
  './data/views.js',
  './data/timeline.js',
  './data/content.json',
  './README.md'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 单个资源失败不阻断整体安装（例如 README 未部署）
    await Promise.allSettled(CORE.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gg-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function navigationHandler(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      // 只缓存无查询串的干净页面，避免 ?id= 变体膨胀
      if (!request.url.includes('?')) cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const idx = await cache.match('./index.html');
    if (idx) return idx;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>离线</title><body style="font-family:serif;padding:40px;background:#f2f1ea;color:#152529">' +
      '<h1>当前处于离线状态</h1><p>本机缓存里还没有这个页面。联网重新打开一次即可离线使用。</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function assetHandler(request) {
  const cache = await caches.open(CACHE);
  // 先按带版本号的完整 URL 精确命中：新版本首次访问直接走网络并写入新缓存
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const fresh = await fetching;
  if (fresh) return fresh;
  // 离线且新版本尚未缓存时，回退到任意同名旧资源
  const any = await cache.match(request, { ignoreSearch: true });
  if (any) return any;
  return new Response('/* offline: not cached */', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }
  event.respondWith(assetHandler(req));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
