const CACHE_NAME = 'side-by-side-shell-v6';
const ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'panel.js',
  'canvas-storage.js',
  'assets/iphone-17-pro-frame.svg',
  'exporters/exporter-registry.js',
  'exporters/gif-exporter.js',
  'exporters/gif-encoder.js',
  'exporters/webm-exporter.js',
  'exporters/webm-muxer.js',
  'exporters/mp4-exporter.js',
  'exporters/mp4-muxer.js',
];
const assetUrls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...assetUrls])));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('side-by-side-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && !assetUrls.has(url.href)) return;

  const cacheKey = navigation
    ? new URL('index.html', self.registration.scope).href
    : event.request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      throw error;
    }
  })());
});
