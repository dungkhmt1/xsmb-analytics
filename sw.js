const CACHE_NAME = "xsmb-v2.6.3-stable-v1";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.json"
];


/* =====================================================
   INSTALL
===================================================== */

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});


/* =====================================================
   ACTIVATE
   XÓA CACHE CŨ
===================================================== */

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


/* =====================================================
   FETCH
===================================================== */

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);


  /* ===================================================
     API
     LUÔN NETWORK - KHÔNG CACHE
  =================================================== */

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
    );

    return;
  }


  /* ===================================================
     JS + CSS
     NETWORK FIRST
  =================================================== */

  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response || !response.ok) {
            return response;
          }

          const copy = response.clone();

          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then(cache => cache.put(request, copy))
          );

          return response;
        })
        .catch(() => caches.match(request))
    );

    return;
  }


  /* ===================================================
     HTML / NAVIGATION
     NETWORK FIRST
  =================================================== */

  if (
    request.mode === "navigate" ||
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response || !response.ok) {
            return response;
          }

          const copy = response.clone();

          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then(cache => cache.put(request, copy))
          );

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }

          return caches.match("/index.html");
        })
    );

    return;
  }


  /* ===================================================
     STATIC ASSETS
     CACHE FIRST + NETWORK FALLBACK
  =================================================== */

  event.respondWith(
    caches
      .match(request)
      .then(async cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        const response = await fetch(request);

        if (response && response.ok) {
          const copy = response.clone();

          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then(cache => cache.put(request, copy))
          );
        }

        return response;
      })
  );
});
