const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `pedi-clinic-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const APP_SHELL_URLS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  // Navigations: try the network first so users always see fresh app
  // state; fall back to the cached offline page when there's no network.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
      )
    );
    return;
  }

  // Static assets: cache-first, then fall back to network.
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches
              .open(APP_SHELL_CACHE)
              .then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
