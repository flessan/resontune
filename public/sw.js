/**
 * ResonTune service worker.
 *
 * Strategy:
 *  - App shell + static assets: stale-while-revalidate.
 *  - Navigations: network-first, falling back to the cached shell so the
 *    app opens offline (local music keeps working — it lives in IndexedDB).
 *  - API GETs: network-first with a short-lived cache fallback so the last
 *    seen catalog still renders offline.
 *  - Audio (/media/*) is intentionally NOT cached here: remote catalog audio
 *    is only cached when the source's licensing/implementation permits it,
 *    and Range requests are better served straight from the network.
 */
const VERSION = 'resontune-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const API_CACHE = `${VERSION}-api`;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/resontune.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // never intercept audio: range requests should hit the network/CDN
  if (url.pathname.startsWith('/media/')) return;

  if (url.pathname.startsWith('/api/')) {
    // auth/user endpoints must never be cached
    if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/me')) return;
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r ?? Response.error())),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  // static assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetching = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? fetching;
    }),
  );
});
