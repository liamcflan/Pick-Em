/*
 * 10K Pool HQ service worker.
 *
 * Deliberately small: it makes the app installable and shows /offline.html when a page load fails
 * because the network is down. It never caches pages or API responses, so balances, picks and
 * scores always come from the server; a stale leaderboard would be worse than an offline notice.
 * Bump VERSION when the offline page or icons change.
 */
const VERSION = "v2";
const CACHE = `pickem-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pickem-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only full page loads are handled. Everything else (RSC fetches, server actions, Supabase,
  // assets) goes straight to the network as if there were no service worker.
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached ?? Response.error();
    }),
  );
});
