/* Reps — service worker.

   Le nom du cache inclut le chemin de déploiement : Reps tourne à la
   fois sur /reps/ et sur /workout-tracker/ (l'ancienne adresse), et les
   deux partagent la même origine. Sans ça, l'activation de l'un
   effacerait le cache de l'autre.

   Bumper la VERSION à CHAQUE déploiement, sinon le téléphone continue
   de servir la version précédente. */
const VERSION = "v6";
const SCOPE = new URL("./", self.location).pathname;   // ex. "/reps/"
const CACHE_NAME = `reps-${VERSION}${SCOPE}`;

const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=2",
  "./js/motion.js?v=2",
  "./js/data.js?v=2",
  "./js/chart.js?v=2",
  "./js/session.js?v=2",
  "./js/views.js?v=2",
  "./js/app.js?v=2",
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
