const CACHE_NAME = 'foresight-finanzas-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/config-loader.js',
  '/js/config.prod.js',
  '/js/pdf-generator.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/utils.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch - estrategia Network First (siempre intenta red primero)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la respuesta es válida, clona y guarda en cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, intenta desde cache
        return caches.match(event.request);
      })
  );
});

// Activate - limpia caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
