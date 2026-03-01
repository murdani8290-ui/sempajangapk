// sw.js - Service Worker SEMPAJANG PWA
// Strategi: Stale While Revalidate
// → Tampilkan cache dulu (cepat), update di background, beritahu user jika ada versi baru

const CACHE_NAME = 'sempajang-v1';

const STATIC_ASSETS = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// INSTALL: Cache aset pertama kali
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Skip cache:', url, err))
        )
      );
    })
  );
});

// ACTIVATE: TIDAK hapus cache lama, langsung klaim semua tab
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// FETCH: Stale While Revalidate
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass: API Google, non-GET
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    event.request.method !== 'GET'
  ) return;

  event.respondWith(staleWhileRevalidate(event.request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Fetch network di background (tidak ditunggu jika ada cache)
  const networkFetchPromise = fetch(request.clone()).then(async networkResponse => {
    if (!networkResponse || !networkResponse.ok) return networkResponse;

    // Khusus index.html: cek apakah ada perubahan
    if (cachedResponse && request.url.includes('index.html')) {
      try {
        const cachedText = await cachedResponse.clone().text();
        const networkText = await networkResponse.clone().text();
        if (cachedText !== networkText) {
          await cache.put(request, networkResponse.clone());
          notifyClientsOfUpdate(); // beritahu app ada update
        }
      } catch(e) {
        await cache.put(request, networkResponse.clone());
      }
    } else {
      // Aset lain: update cache diam-diam tanpa notifikasi
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  // Sajikan cache dulu jika ada (cepat)
  if (cachedResponse) return cachedResponse;

  // Tidak ada cache → tunggu network
  const networkResponse = await networkFetchPromise;
  if (networkResponse) return networkResponse;

  // Offline total
  return new Response('Offline - Buka kembali saat ada koneksi', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Kirim pesan update ke semua tab aktif
async function notifyClientsOfUpdate() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
}
