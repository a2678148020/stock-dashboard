const CACHE_NAME = 'stock-dashboard-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // API requests: network only
  if (url.indexOf('qt.gtimg.cn') >= 0 || url.indexOf('ifzq.gtimg.cn') >= 0 || url.indexOf('smartbox.gtimg.cn') >= 0 || url.indexOf('sinajs.cn') >= 0) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS/CSS files: network first (no cache)
  if (url.indexOf('.js') >= 0 || url.indexOf('.css') >= 0) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML and other assets: cache first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});
