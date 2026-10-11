/**
 * sw.js — Service worker.
 *
 * Cache-first for the app shell (this is a local-first app: the shell should
 * work offline), with a background refresh for HTML and JSON so a reload picks
 * up changes when the network is available. Only GET requests to same-origin
 * URLs are handled. Question banks imported from the file picker never touch
 * the network.
 */

// Bump this whenever any precached file changes: the old caches are deleted on
// activate, so a fixed build cannot keep serving a stale shell.
const VERSION = 'v1.1.0-6';
const SHELL_CACHE = `mymppsc-shell-${VERSION}`;
const RUNTIME_CACHE = `mymppsc-runtime-${VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui/router.js',
  './js/ui/components.js',
  './js/core/constants.js',
  './js/core/db.js',
  './js/core/state.js',
  './js/core/schema.js',
  './js/core/util.js',
  './js/core/validate.js',
  './js/services/analytics.js',
  './js/services/attempts.js',
  './js/services/data.js',
  './js/services/importer.js',
  './js/services/planner.js',
  './js/services/questions.js',
  './js/services/revision.js',
  './js/services/scoring.js',
  './js/services/select.js',
  './js/services/tests.js',
  './js/ui/views/analytics.js',
  './js/ui/views/bank.js',
  './js/ui/views/custom.js',
  './js/ui/views/dashboard.js',
  './js/ui/views/help.js',
  './js/ui/views/mistakes.js',
  './js/ui/views/report.js',
  './js/ui/views/revision.js',
  './js/ui/views/runner.js',
  './js/ui/views/settings.js',
  './js/ui/views/shared.js',
  './js/ui/views/smart.js',
  './js/ui/views/syllabus.js',
  './js/ui/views/testcentre.js',
  './js/ui/views/topic.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/demo/demo-bank.json',
  './data/schema/question-bank.schema.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually so one missing file cannot fail the whole install.
      await Promise.all(
        SHELL_FILES.map(async (file) => {
          try {
            const response = await fetch(file, { cache: 'reload' });
            if (response.ok) await cache.put(file, response);
          } catch (err) {
            console.warn('[sw] could not cache', file, err);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  const isData = url.pathname.endsWith('.json');

  if (isNavigation || isData) {
    // Network-first so a served update is picked up, falling back to the cache offline.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const cache = await caches.open(isNavigation ? SHELL_CACHE : RUNTIME_CACHE);
            cache.put(isNavigation ? './index.html' : request, fresh.clone());
          }
          return fresh;
        } catch (err) {
          const cached = (await caches.match(request)) || (isNavigation ? await caches.match('./index.html') : null);
          if (cached) return cached;
          throw err;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Refresh in the background; never block the response on the network.
        fetch(request)
          .then((fresh) => (fresh && fresh.ok ? caches.open(SHELL_CACHE).then((c) => c.put(request, fresh.clone())) : null))
          .catch(() => {});
        return cached;
      }
      const fresh = await fetch(request);
      if (fresh && fresh.ok && url.pathname.startsWith('/css/')) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    })(),
  );
});
