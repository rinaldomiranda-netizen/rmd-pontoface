const CACHE = 'rmd-pontoface-v5';
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

  // Navegação e arquivos de aplicação devem sempre buscar a versão atual.
  // Isso evita que uma PWA instalada continue executando um bundle antigo.
  const isAppAsset = e.request.mode === 'navigate' ||
    /\/(assets|src)\/.*\.(js|css)$/.test(new URL(e.request.url).pathname) ||
    /\/index\.html$/.test(new URL(e.request.url).pathname);

  if (isAppAsset) {
    e.respondWith(
      fetch(new Request(e.request, { cache: 'no-store' })).catch(() =>
        caches.match(e.request).then(x => x || caches.match('/index.html'))
      )
    );
    return;
  }

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
