/* Service worker : garde l'app sur le téléphone pour qu'elle s'ouvre sans Internet.
   Stratégie : on répond tout de suite avec la copie gardée, et on la met à jour en arrière-plan
   (la nouvelle version s'affiche à l'ouverture suivante). Change V à chaque mise à jour. */
const V = "budget-v1";
const FONTS = "budget-fonts";
const SHELL = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;

  if (u.origin === location.origin) {
    e.respondWith(caches.open(V).then(async c => {
      const key = r.mode === "navigate" ? "./index.html" : r;
      const cached = await c.match(key, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      return net.catch(() => Response.error());
    }));
    return;
  }

  // polices Google : gardées après le premier chargement
  if (u.host === "fonts.googleapis.com" || u.host === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(c => c.match(r).then(m => m || fetch(r).then(res => { c.put(r, res.clone()); return res; }))));
  }
  // tout le reste (Google Drive, connexion) passe directement par le réseau
});
