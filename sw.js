// Bump the version when changing any cached game file.
const prefix = 'midnight-paws-boba-shell-';
const cacheName = prefix + '14';
const home = new URL('index.html', self.registration.scope).href;
const renderer = new URL('assets/three-r128.min.js', self.registration.scope).href;

const files = [home, renderer, ...['market.css?v=5','market.js?v=5','market-scene.js?v=5','market-cooking.js?v=5','cafe-service.css?v=14','original-room.css?v=14','cafe-workers.js?v=14','cafe-room.js?v=14','cafe-service.js?v=14','play.html',
  ...['udon','seoul','saigon','bangkok','chennai','malaya'].map(id=>'assets/market/'+id+'.webp')
].map(path=>new URL(path,self.registration.scope).href)];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache=await caches.open(cacheName);
    await cache.addAll(files.map(url=>new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if(event.data==='release')event.ports[0]?.postMessage(cacheName);
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
  const isLauncher = event.request.mode === 'navigate' && url.origin + url.pathname === new URL('play.html',self.registration.scope).href;
  if (!isHome && !isLauncher && !files.includes(url.href)) return;
  const key = isHome ? home : isLauncher ? url.origin + url.pathname : url.href;
  event.respondWith(caches.open(cacheName).then(async cache =>
    (await cache.match(key)) || fetch(event.request)));
});
