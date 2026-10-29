/* Service worker do app de cotações.
 * Estratégia: navegação em rede com queda para o app shell; estáticos em
 * cache-primeiro com revalidação. Requisições /api nunca são cacheadas para
 * não exibir cotação desatualizada nem dado de outro usuário.
 */
const VERSION = "v1";
const SHELL_CACHE = `cotacao-shell-${VERSION}`;
const ASSET_CACHE = `cotacao-assets-${VERSION}`;
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isCacheableAsset = request => {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/manus-oauth/")) return false;
  return ["style", "script", "image", "font"].includes(request.destination);
};

self.addEventListener("fetch", event => {
  const { request } = event;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return (await caches.match("/")) ?? Response.error();
        })
    );
    return;
  }

  if (!isCacheableAsset(request)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});