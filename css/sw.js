/*  YuGame PWA – Service Worker (Workbox v6)
    ----------------------------------------------------------
    ▸ precache:   html/css/js/manifest/icons (hash-revision)
    ▸ runtime:    Google Fonts, imgs, JSON-фразы, Gemini API
    ▸ offline:    fallback HTML, кэш first + обновление
----------------------------------------------------------*/
import { clientsClaim }           from 'workbox-core';
import { precacheAndRoute }       from 'workbox-precaching';
import { registerRoute }          from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin }       from 'workbox-expiration';

// демократизируем сразу страницу после install
self.skipWaiting();
clientsClaim();

/* ---------- 1. Pre-cache билд-ассетов ---------- */
precacheAndRoute(self.__WB_MANIFEST || []);

/* ---------- 2. Pages HTML → network-first ---------- */
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-html',
    networkTimeoutSeconds: 6,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 })
    ]
  })
);

/* ---------- 3. CSS / JS / JSON (stale-while-revalidate) ---------- */
registerRoute(
  ({ request, url }) =>
    ['style', 'script'].includes(request.destination) ||
    url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 14 * 24 * 60 * 60 })
    ]
  })
);

/* ---------- 4. Images / icons → cache-first ---------- */
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })
    ]
  })
);

/* ---------- 5. Google Fonts → stale-while-revalidate + долгий Exp ---------- */
registerRoute(
  ({ url }) => url.origin.startsWith('https://fonts.gstatic.com'),
  new StaleWhileRevalidate({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })
    ]
  })
);

/* ---------- 6. Gemini-API → network-first, короткий TTL ---------- */
registerRoute(
  ({ url }) => url.hostname === 'generativelanguage.googleapis.com',
  new NetworkFirst({
    cacheName: 'gemini-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 })
    ]
  })
);

/* ---------- 7. Offline fallback ---------- */
const FALLBACK_URL = '/offline.html';
precacheAndRoute([{ url: FALLBACK_URL, revision: null }]);

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).catch(() => caches.match(FALLBACK_URL))
      )
    );
  }
});
