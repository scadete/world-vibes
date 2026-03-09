const CACHE = 'wv-v3';
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
    )
  );
  // clients.claim() removed — claiming mid-load causes unexpected page reloads.
  // New page loads after activation will be SW-controlled.
});

self.addEventListener('fetch', e => {
  // Cache-first for all shell assets (HTML, JS, icons)
  e.respondWith(
    caches.match(e.request)
      .then(r => r || fetch(e.request))
      .catch(() => fetch(e.request))
  );
});
