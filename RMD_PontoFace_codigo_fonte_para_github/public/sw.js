const CACHE = 'rmd-pontoface-v2';
const APP = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first: nunca guarda em cache respostas de erro (404/401/etc.),
  // só usa o cache como reserva se estiver offline.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(x => x || caches.match('/index.html')))
  );
});
