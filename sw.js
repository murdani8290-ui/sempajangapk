// sw.js - Service Worker SEMPAJANG PWA
// VERSI BERSIH - kompatibel dengan install prompt Chrome Android

const CACHE_NAME = 'sempajang-v1';

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// INSTALL
self.addEventListener('install', event => {
  // JANGAN skipWaiting - ini yang bikin install prompt hilang
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Skip:', url))
        )
      )
    )
  );
});

// ACTIVATE - JANGAN clients.claim() terlalu agresif
self.addEventListener('activate', event => {
  // Hanya hapus cache LAMA jika nama berbeda (bukan v1)
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
});

// FETCH - Stale While Revalidate
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Jangan intercept API Google Apps Script
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    event.request.method !== 'GET'
  ) return;

  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Update cache di background
  const networkPromise = fetch(request.clone()).then(async res => {
    if (res && res.ok) {
      // Cek perubahan pada index.html untuk notifikasi update
      if (cached && request.url.includes('index.html')) {
        try {
          const oldText = await cached.clone().text();
          const newText = await res.clone().text();
          if (oldText !== newText) {
            await cache.put(request, res.clone());
            // Beritahu semua tab ada update
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(c => c.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
          }
        } catch(e) {
          await cache.put(request, res.clone());
        }
      } else {
        await cache.put(request, res.clone());
      }
    }
    return res;
  }).catch(() => null);

  // Sajikan cache (cepat), update jalan di background
  if (cached) return cached;

  // Tidak ada cache, tunggu network
  const networkRes = await networkPromise;
  if (networkRes) return networkRes;

  return new Response('Offline', { status: 503 });
}
