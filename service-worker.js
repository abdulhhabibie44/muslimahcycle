// service-worker.js
// Strategi caching campuran:
// - File aplikasi milik sendiri (HTML/JS/CSS) -> network-first, supaya update
//   selalu terpakai begitu perangkat online, dengan fallback ke cache saat offline.
// - Aset CDN pihak ketiga (Tailwind, Alpine, Dexie, dst) -> cache-first, karena
//   jarang berubah dan supaya tetap kuat dipakai offline + hemat kuota.
//
// PENTING: setiap kali ada update pada file aplikasi, naikkan CACHE_VERSION di
// bawah ini. Perubahan pada file ini sendiri adalah satu-satunya cara browser
// (termasuk PWA iOS) mendeteksi ada versi baru yang perlu diinstal ulang.

const CACHE_VERSION = 'v4';
const CACHE_NAME = `muslimah-cycle-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './styles/main.css',
  './database/db.js',
  './services/hijriService.js',
  './services/cycleService.js',
  './services/qadhaService.js',
  './services/islamicEventsService.js',
  './services/backupService.js',
  './utils/theme.js',
  './utils/format.js',
  './config/constants.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return; // abaikan skema seperti chrome-extension:

  const isSameOrigin = new URL(event.request.url).origin === self.location.origin;

  if (isSameOrigin) {
    // Network-first: file aplikasi sendiri selalu dicoba versi terbaru dari jaringan dulu
    // (cache: 'no-store' supaya HTTP cache browser juga dilewati, bukan cuma cache SW)
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first: aset CDN pihak ketiga, prioritaskan offline & hemat kuota
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
      })
    );
  }
});
