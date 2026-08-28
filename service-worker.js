const CACHE_NAME = 'hermoso-dashboard-v20260828-pwa-1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './auth.js',
  './api.js',
  './ui.js',
  './overview.js',
  './kanban.js',
  './agenda.js',
  './atendimento.js',
  './relatorios.js',
  './vendor/chart.umd.min.js',
  './logo.jpg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia chamadas do backend/n8n nem requisições autenticadas.
  if (url.hostname === 'barbearia.rsfbinformatica.com.br' || event.request.headers.has('authorization')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets estáticos: cache-first para abrir rápido como app.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
