// Lynn 的小词窝 · 离线缓存
// 网页本身（html/js/css/json）优先走网络，没网或网络很慢时用缓存，所以更新后总能拿到新版本。
// 词典分片和识别组件体积大、基本不变，用缓存优先。
// 读音 mp3 不经过这里，交给浏览器自己处理（iPad Safari 播放音频需要分段请求）。
// 如果以后改了 dictionary/ 或 vendor/ 里的文件，把下面的 VERSION 改一下即可清掉旧缓存。
const VERSION = 'lynn-v23-20261104';
const CORE = ['./', 'index.html', 'app.css', 'lynn.css', 'dataload.js', 'model.js', 'sync.js', 'extract.js', 'dictionary.js', 'speech.js', 'importer.js', 'christmas.js', 'festival.js', 'release.js', 'welcome.js', 'app.js', 'mascot.svg', 'mascot-bday.svg', 'cet4.json', 'audio/index.json?v=emma-1', 'manifest.webmanifest', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => Promise.all(CORE.map(url => cache.add(new Request(url, {cache: 'reload'})).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('lynn-') && key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Safari 不接受 Service Worker 返回“被重定向过”的页面，这里把它复制成普通响应。
async function clean(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
}

async function fromCache(cache, request) {
  return (await cache.match(request)) || (await cache.match(request, {ignoreSearch: true})) ||
    (request.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : undefined);
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  const network = fetch(request).then(clean).then(response => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  network.catch(() => {});
  const slow = new Promise(resolve => setTimeout(async () => { const hit = await fromCache(cache, request); if (hit) resolve(hit); }, 4000));
  try {
    return await Promise.race([network, slow]);
  } catch (error) {
    const hit = await fromCache(cache, request);
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (/\/audio\/[^/]+\.mp3$/i.test(path) || /\/photo\.(?:jpe?g|png|webp)$/i.test(path) || /\/sw\.js$/.test(path)) return;
  if (/\/(?:dictionary|vendor)\//.test(path)) { event.respondWith(cacheFirst(request)); return; }
  event.respondWith(networkFirst(request));
});
