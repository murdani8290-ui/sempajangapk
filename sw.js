// ============================================================
// SEMPAJANG - Service Worker
// Versi cache — update angka ini setiap deploy baru
// ============================================================
const CACHE_NAME = 'sempajang-v1';

// File yang di-cache untuk akses offline
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // CDN libraries — di-cache agar bisa offline
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
];

// ============================================================
// INSTALL — cache semua asset saat pertama kali install
// ============================================================
self.addEventListener('install', function(event) {
  console.log('[SW] Installing SEMPAJANG v1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching assets...');
      // Gunakan individual add agar satu gagal tidak block semua
      return Promise.allSettled(
        CACHE_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Gagal cache:', url, err.message);
        }))
      );
    }).then(function() {
      console.log('[SW] Install selesai');
      return self.skipWaiting(); // Aktif langsung tanpa menunggu tab ditutup
    })
  );
});

// ============================================================
// ACTIVATE — hapus cache lama
// ============================================================
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Menghapus cache lama:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      console.log('[SW] Aktif dan siap');
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — strategi: Network First untuk API, Cache First untuk asset
// ============================================================
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Panggilan ke GAS backend — selalu Network (tidak pernah di-cache)
  // karena data harus selalu fresh
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'Tidak ada koneksi internet. Coba lagi nanti.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Asset lain — Cache First, fallback ke network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        // Cache response baru (hanya request GET yang berhasil)
        if (event.request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        // Offline dan tidak ada cache — tampilkan halaman offline minimal
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 408 });
      });
    })
  );
});

// ============================================================
// MESSAGE — bisa trigger update dari halaman
// ============================================================
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
