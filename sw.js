// SW auto-mise à jour avec stratégie réseau d'abord pour les pages HTML
const CACHE = "bilan-v15"; // change le numéro à chaque nouvelle version

// On NE MET PAS index.html dans la liste, pour éviter de garder une vieille version
const ASSETS = [
  "./",
  "./style.css?v=12",
  "./script.js?v=12",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Installation : télécharge les fichiers statiques
self.addEventListener("install", (e) => {
  self.skipWaiting(); // active tout de suite la nouvelle version
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

// Activation : supprime les anciens caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Gestion des requêtes
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const isNavigation = e.request.mode === "navigate";

  if (isNavigation) {
    // Pour les pages HTML → on essaie le réseau d'abord
    e.respondWith(
      fetch(e.request).catch(() => caches.match("./"))
    );
    return;
  }

  // Pour le reste (CSS, JS, images...) → on sert depuis le cache d'abord
  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      })
    )
  );
});
