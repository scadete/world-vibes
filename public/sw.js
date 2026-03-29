const CACHE = 'wv-v9';
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
  // /lib/transformers.min.js cached lazily on first use (too large for install)
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache /index.html first — this is the critical offline fallback.
    // If this one fails (e.g. DNS failure during install), the whole install
    // fails so we don't activate a SW that can't serve anything.
    await cache.add('/index.html');
    // Remaining shell files are best-effort: a failure doesn't abort the install.
    await Promise.allSettled(
      SHELL.filter(u => u !== '/index.html').map(url => cache.add(url))
    );
    self.skipWaiting();
  })());
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
  // shards, jsDelivr WASM, Cloudflare proxy) bypass the SW entirely.
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Navigation requests: cache-first (stale-while-revalidate).
  //
  // Serving /index.html from cache immediately makes the app load reliably
  // even when mobile DNS is failing (ERR_NAME_NOT_RESOLVED). The cache is
  // refreshed in the background so the next visit gets the latest shell.
  //
  // Note: fetch(e.request.url) — NOT fetch(e.request) — to avoid inheriting
  // redirect:'manual' from the navigate request, which produces opaque-redirect
  // responses that iOS WebKit mishandles as "permanently-removed.invalid".
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('/index.html');
      if (cached) {
        // Serve stale cache immediately; refresh in background.
        fetch(e.request.url)
          .then(r => { if (r.ok) caches.open(CACHE).then(c => c.put('/index.html', r)); })
          .catch(() => {});
        return cached;
      }
      // Cache empty (first install or cleared): fall through to network.
      return fetch(e.request.url).catch(() =>
        new Response(
          '<!doctype html><title>Offline</title><p>Offline — please reconnect.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        )
      );
    })());
    return;
  }

  // Cache-first for all other same-origin assets.
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
