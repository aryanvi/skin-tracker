// The service worker: a helper the phone keeps so the app opens without internet.
// It only keeps a copy of the app's own files. Photos are never stored here;
// they live in IndexedDB only.
//
// Strategy: network first. Online, you always get the newest version;
// offline, the saved copy is used.

const CACHE = "skin-tracker-shell";

const SHELL = [
  "./",
  "index.html",
  "style.css",
  "dates.js",
  "db.js",
  "zip.js",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "fonts/inconsolata-500.woff2",
  "fonts/instrument-serif-400.woff2",
];

self.addEventListener("install", (event) => {
  // "reload" skips the browser's own cache, so the saved copy is the newest version
  const requests = SHELL.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only our own files, only reads. Anything else is left alone.
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    // "no-cache" checks with the website each time, so a push shows up straight away
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      // Look only in our own copy: other projects on the same website
      // (e.g. aryanvi.github.io/…) can have saved copies of their own
      .catch(() => caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true })))
  );
});
