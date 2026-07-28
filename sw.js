const CACHE_NAME = "xsmb-v2.6.2-cache-v2";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/manifest.json"
];

/*
========================================================
INSTALL
========================================================
*/

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});


/*
========================================================
ACTIVATE
Xóa cache phiên bản cũ
========================================================
*/

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }

            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});


/*
========================================================
FETCH
========================================================
*/

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);


  /*
  ======================================================
  API
  LUÔN LẤY TỪ NETWORK
  KHÔNG CACHE
  ======================================================
  */

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
    );

    return;
  }


  /*
  ======================================================
  JAVASCRIPT
  NETWORK FIRST
  ======================================================
  */

  if (
    url.pathname.endsWith(".js") ||
    url.pathname === "/app.js"
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => {
              cache.put(request, copy);
            });

          return response;
        })
        .catch(() => caches.match(request))
    );

    return;
  }


  /*
  ======================================================
  HTML
  NETWORK FIRST
  ======================================================
  */

  if (
    request.mode === "navigate" ||
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => {
              cache.put(request, copy);
            });

          return response;
        })
        .catch(() =>
          caches.match(request)
        )
    );

    return;
  }


  /*
  ======================================================
  STATIC
  CACHE FIRST
  ======================================================
  */

  event.respondWith(
    caches
      .match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then(response => {
            const copy = response.clone();

            caches
              .open(CACHE_NAME)
              .then(cache => {
                cache.put(request, copy);
              });

            return response;
          });
      })
  );
});