// Registered as /sw.js?v=<build hash> (stamped into index.html by the
// stamp-build-hash plugin in vite.config.ts), so the cache names below change
// on every deploy and the activate handler drops the previous build's caches.
// Without that, a months-old index.html stayed in STATIC_CACHE and kept asking
// for hashed chunks the current image no longer ships.
const CACHE_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const STATIC_CACHE = `lervit-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `lervit-dynamic-${CACHE_VERSION}`;
const API_CACHE = `lervit-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/favicon-16.png',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json'
];

const CACHEABLE_API_ROUTES = [
  '/api/movers',
  '/api/bookings',
  '/api/config/support-phone',
  '/api/config/stripe-public-key'
];

const OFFLINE_FALLBACK_PAGE = '/';

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            return key.startsWith('lervit-') && 
                   key !== STATIC_CACHE && 
                   key !== DYNAMIC_CACHE && 
                   key !== API_CACHE;
          })
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.origin !== location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const isCacheableRoute = CACHEABLE_API_ROUTES.some(route => 
      url.pathname === route || url.pathname.startsWith(route + '/')
    );
    
    if (isCacheableRoute) {
      event.respondWith(networkFirstWithCache(request, API_CACHE, 5000));
    }
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(request, STATIC_CACHE, 3000));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

async function networkFirstWithCache(request, cacheName, timeout = 5000) {
  const cache = await caches.open(cacheName);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('[SW] Network failed, checking cache for:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    if (request.mode === 'navigate') {
      const fallback = await cache.match(OFFLINE_FALLBACK_PAGE);
      if (fallback) {
        console.log('[SW] Serving app shell fallback');
        return fallback;
      }
    }
    
    console.log('[SW] No cache available for:', request.url);
    return new Response(JSON.stringify({ 
      error: 'You are offline', 
      offline: true,
      cached: false 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 404 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification from LervIT',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      },
      actions: data.actions || []
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'LervIT', options)
    );
  } catch (e) {
    console.log('[SW] Push event error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
