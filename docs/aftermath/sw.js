/* 오프라인 실행 — 한 번 열면 네트워크 없이도 돈다.
   먼저 캐시로 바로 띄우고, 뒤에서 새 파일을 받아 다음 실행에 쓴다(stale-while-revalidate).
   VERSION 은 settings.js 의 APP.version 과 맞춘다 — 바뀌면 예전 캐시를 지운다. */
const VERSION = '1.0.0-rc.1';
const CACHE = 'aftermath-' + VERSION;
const SHELL = [
  './', './index.html', './css/game.css', './manifest.webmanifest',
  './js/settings.js', './js/i18n.js', './js/levels.js', './js/audio.js', './js/world.js', './js/themes.js',
  './js/entities.js', './js/models.js', './js/game.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png', './privacy.html'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('aftermath-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
