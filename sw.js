/* Reps — service worker.

   Le nom du cache inclut le chemin de déploiement : Reps tourne à la
   fois sur /reps/ et sur /workout-tracker/ (l'ancienne adresse), et les
   deux partagent la même origine. Sans ça, l'activation de l'un
   effacerait le cache de l'autre.

   Bumper la VERSION à CHAQUE déploiement, sinon le téléphone continue
   de servir la version précédente. */
const VERSION = "v12";
const SCOPE = new URL("./", self.location).pathname;   // ex. "/reps/"
const CACHE_NAME = `reps-${VERSION}${SCOPE}`;

const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=10",
  "./js/theme.js?v=10",
  "./js/motion.js?v=10",
  "./js/data.js?v=10",
  "./js/chart.js?v=10",
  "./js/session.js?v=10",
  "./js/views.js?v=10",
  "./js/app.js?v=10",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          /* Les caches de l'ancienne app « Mes Workouts », et mes
             propres versions précédentes sur CE chemin seulement. */
          .filter((k) => k.startsWith("workout-tracker-") || (k.endsWith(SCOPE) && k !== CACHE_NAME))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* La coquille passe par le RÉSEAU d'abord, le reste par le cache.

   Sans ça, index.html sortait du cache à chaque lancement : le
   nouveau service worker s'installait bien, mais la page affichée
   restait l'ancienne, et il fallait rouvrir l'app deux ou trois
   fois pour voir un changement. Les scripts et la CSS gardent le
   cache d'abord : ils sont versionnés par ?v=N, donc une nouvelle
   coquille demande de nouvelles URL, qui manquent au cache et
   partent au réseau toutes seules. Hors ligne, on retombe sur la
   copie en cache. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./")))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
