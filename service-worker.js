const CACHE_NAME = 'hermoso-dashboard-v20260828-manual-history-3';
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

const NETWORK_FIRST_EXTENSIONS = /\.(html|js|css|webmanifest)$/i;

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

  // Nunca cacheia chamadas do backend/n8n, requisições autenticadas ou mutações.
  if (
    url.hostname === 'barbearia.rsfbinformatica.com.br'
    || event.request.headers.has('authorization')
    || event.request.method !== 'GET'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML/JS/CSS/manifest precisam ser network-first para o app instalado receber correções.
  const isNavigation = event.request.mode === 'navigate';
  const shouldUseNetworkFirst = isNavigation || NETWORK_FIRST_EXTENSIONS.test(url.pathname);

  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Imagens/vendor: cache-first para abrir rápido e funcionar melhor como app.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
