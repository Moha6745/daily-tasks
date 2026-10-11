/* عامل الخدمة: تخزين ملفات التطبيق للعمل دون اتصال. */
const CACHE = 'tahaddi30-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/icon.svg',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/config.js',
  './assets/js/datetime.js',
  './assets/js/location.js',
  './assets/js/notifications.js',
  './assets/js/prayer.js',
  './assets/js/qibla.js',
  './assets/js/store.js',
  './assets/js/sync.js',
  './assets/js/sync-shape.js',
  './assets/js/tasks.js',
  './assets/js/theme.js',
  './assets/js/ui.js',
  './assets/js/views/add-task.js',
  './assets/js/views/auth-view.js',
  './assets/js/views/chrome.js',
  './assets/js/views/home.js',
  './assets/js/views/onboarding.js',
  './assets/js/views/prayer-view.js',
  './assets/js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // نقاط المزامنة: من الشبكة دائماً ولا تُخزَّن.
  // لولا هذا الاستثناء لعاد /api/health من الذاكرة، وأعاد عند انقطاع
  // الشبكة صفحةَ index.html بدل JSON فيظهر الخطأ في غير موضعه.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // الخطوط الخارجية: من الشبكة أولاً مع نسخة احتياطية في الذاكرة
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => hit)),
    );
    return;
  }

  // ملفات التطبيق: من الذاكرة أولاً، ثم الشبكة
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
