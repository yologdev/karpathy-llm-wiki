// Minimal service worker. Its ONLY purpose is to make yopedia an installable PWA,
// which is what unlocks the Web Share Target (sharing a link to yopedia from the
// OS share sheet). It deliberately does NOT cache or intercept anything: the
// fetch handler never calls respondWith(), so every request goes to the network
// normally — it can't serve stale content or break the app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // no-op — let the browser handle the request as if no SW were present.
});
