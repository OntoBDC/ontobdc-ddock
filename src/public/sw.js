// Keeps what the application downloads and does not change, so that the next visit does not download it again:
// the files of the application, which carry the hash of their content in the name, and the Python runtime
// (Pyodide, its packages and the wheels), whose files carry the version. The server of the page (GitHub Pages)
// says its files are fresh for ten minutes only, and changes every ETag with each deploy.
//
// The wheels of this project that are built from its source keep the version of the source, so their name does
// not say whether they changed: `python/cache.json` lists them and they are never kept.
const BUILD = new URL(self.location.href).searchParams.get('v');
if (!BUILD) throw new Error('The service worker needs the build it belongs to in its address (?v=).');

const ASSETS_PREFIX = 'ontobdc-assets-';
const PYTHON_PREFIX = 'ontobdc-python-';
const ASSETS = `${ASSETS_PREFIX}${BUILD}`;
const scope = new URL(self.registration.scope).pathname;

let runtime = null;
/** The name of the cache of the runtime and the files that are not kept, as `python/cache.json` says them. */
const runtimeInfo = () => {
  runtime ??= fetch(`${scope}python/cache.json`, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`python/cache.json: HTTP ${response.status}`);
      return response.json();
    })
    .then((info) => {
      if (typeof info.pyodide !== 'string' || !Array.isArray(info.mutable)) throw new Error('python/cache.json must say the version of Pyodide and the files that change.');
      return { name: `${PYTHON_PREFIX}${info.pyodide}`, mutable: new Set(info.mutable) };
    });
  return runtime;
};

const cacheFirst = async (request, name) => {
  const cache = await caches.open(name);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
};

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const info = await runtimeInfo();
    // What belongs to another build of the application, or to another version of Pyodide, is not wanted any more.
    for (const name of await caches.keys()) {
      const old = (name.startsWith(ASSETS_PREFIX) && name !== ASSETS) || (name.startsWith(PYTHON_PREFIX) && name !== info.name);
      if (old) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope)) return;
  const path = url.pathname.slice(scope.length);

  if (/^assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(path)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (path.startsWith('python/pyodide/') || path.startsWith('python/wheels/')) {
    // Without `python/cache.json` (not deployed, or not readable) the runtime is not kept, but it is still downloaded:
    // the cache is an aid and must not stop the application. The same failure stops this worker from activating,
    // which is how the page is told that the cache could not be set up.
    event.respondWith(runtimeInfo().then(
      (info) => (info.mutable.has(path.split('/').pop()) ? fetch(request) : cacheFirst(request, info.name)),
      () => fetch(request),
    ));
  }
});
