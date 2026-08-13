const CACHE_NAME = 'growthapp-cache-v26';
const ASSETS = [
  '/',
  '/index.html',
  '/Gym.html',
  '/manifest.json',
  '/icon.svg',
  '/logo.png',
  '/favicon.png'
];

// Install Service Worker and cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static shell assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercept network requests - Network First for HTML/navigation requests so updates appear immediately
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET requests (POST/PUT sync calls pass straight through)
  if (request.method !== 'GET') return;

  // Keep the sync API network-only so polling always returns the freshest server state
  if (request.url && request.url.includes('/api/')) return;

  if (request.mode === 'navigate' || (request.url && request.url.includes('index.html'))) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(request);
    })
  );
});
