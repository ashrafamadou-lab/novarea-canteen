// Novarea — Canteen Access & Meal Control — Service Worker (offline PWA)
const CACHE_NAME = 'ntb-canteen-v31';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/core.js',
  './assets/tests.js',
  './assets/supabase-config.js',
  './assets/logo-novarea.png',
  './assets/logo-novarea-white.png',
  './assets/emblem.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
// CDN libraries cached for offline use after first visit
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // IMPORTANT: never cache Supabase API/data responses (sensitive employee data).
  if (url.hostname.endsWith('.supabase.co')) return;

  // Local resources: cache-first, network fallback (updates cache in background).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // CDN libraries: cache-first for offline scanning.
  if (req.url.includes('cdnjs.cloudflare.com') || req.url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached);
      })
    );
  }
});
