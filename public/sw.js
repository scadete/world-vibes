const CACHE = 'wv-v6';
const SHELL = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
  '/feeds.js',
  '/risk-sources.js',
  '/db.js',
  '/fetcher.js',
  '/embeddings-worker.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only handle same-origin requests. Cross-origin fetches (HuggingFace model
  // shards, jsDelivr WASM, Cloudflare proxy) bypass the SW entirely so that
  // large streaming downloads do not run through the SW event loop.
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Navigation requests (page loads, F5, back/forward): network-first with
  // cached /index.html as fallback so the SPA loads even when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for all other same-origin assets (JS, icons, manifest).
  e.respondWith(
    caches.match(e.request)
      .then(r => r || fetch(e.request))
  );
});
