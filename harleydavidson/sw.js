const PREFIX = "hd-locator-marcolin-";
const SHELL = `${PREFIX}shell-v5`;
const TILES = `${PREFIX}tiles-v5`;
const TILE_LIMIT = 450;
const ASSETS = ["./", "./index.html", "./css/styles.css", "./js/main.js", "./js/geocoding.js", "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css", "../shared/locations.js", "../shared/pins.js"];
const assetUrls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll([...assetUrls])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const obsolete = keys.filter(key => (key.startsWith(PREFIX) && key !== SHELL && key !== TILES) || /^hd-eyewear-(shell|tiles)-v[1-4]$/.test(key));
    await Promise.all(obsolete.map(key => caches.delete(key)));
    await self.clients.claim();
    // Already open clients running the old code need one navigation for this migration.
    if (obsolete.length) {
      const clients = await self.clients.matchAll({ type: "window" });
      // A navigation may wait for activation before dispatching its fetch event.
      // Do not make activation itself wait for that navigation.
      for (const client of clients.filter(client => client.url.startsWith(self.registration.scope))) client.navigate(client.url).catch(() => {});
    }
  })());
});
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(request, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error("Shell unavailable");
    await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw error;
  } finally { clearTimeout(timer); }
}
async function mapAsset(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - TILE_LIMIT)).map(key => cache.delete(key)));
  }
  return response;
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Mutable directory responses are validated and cached by the application.
  // Auth, API calls, and unrelated applications never enter this shell cache.
  if (url.pathname.endsWith("/data/locations.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
  } else if (assetUrls.has(url.origin + url.pathname)) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname.endsWith("tiles.openfreemap.org") || url.hostname.endsWith("arcgisonline.com") || (url.hostname === "cdn.jsdelivr.net" && /leaflet|maplibre/.test(url.pathname))) {
    event.respondWith(mapAsset(request));
  }
});
