// Bump the version when changing any cached game file.
const prefix = 'midnight-paws-boba-shell-';
const cacheName = prefix + '3';
const home = new URL('index.html', self.registration.scope).href;
const renderer = new URL('assets/three-r128.min.js', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([home, renderer].map(url => new Request(url, {cache: 'reload'})))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isHome = event.request.mode === 'navigate' &&
    [self.registration.scope, home].includes(url.origin + url.pathname);
  if (!isHome && url.href !== renderer) return;
  const key = isHome ? home : renderer;
  event.respondWith(caches.open(cacheName).then(async cache =>
    (await cache.match(key)) || fetch(event.request)));
});
