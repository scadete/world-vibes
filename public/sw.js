const CACHE = 'wv-v8';
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
  // /lib/transformers.min.js (~888 KB) cached lazily on first use instead of
  // during install to prevent addAll() timeouts on slow mobile connections.
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  // Only handle same-origin requests. Cross-origin fetches (HuggingFace model
  // shards, jsDelivr WASM, Cloudflare proxy) bypass the SW entirely so that
  // large streaming downloads do not run through the SW event loop.
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Navigation requests (page loads, back/forward): network-first with cached
  // /index.html fallback so the SPA loads even when offline.
  //
  // Use e.request.url (string) — NOT e.request — to avoid inheriting the
  // redirect:'manual' mode that navigation requests carry. Passing a navigate-
  // mode request to fetch() returns an opaque-redirect response on Cloudflare
  // redirects (e.g. http→https, trailing-slash), which iOS WebKit mishandles
  // and surfaces as "permanently-removed.invalid".
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request.url).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached ?? new Response(
          '<!doctype html><title>Offline</title><p>Offline — please reconnect.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // Cache-first for all other same-origin assets (JS, icons, manifest).
  // Assets not in SHELL (e.g. transformers.min.js) are fetched from network
  // and stored in cache on first use so subsequent loads are instant.
  e.respondWith(
    caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});
