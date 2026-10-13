/* عامل الخدمة: تخزين ملفات التطبيق للعمل دون اتصال. */
const CACHE = 'tahaddi30-v11';

/**
 * الخطوط الخارجية في ذاكرة مستقلّة بلا رقم إصدار.
 * لو خُزّنت مع ملفات التطبيق لمُسحت مع كل نشرة جديدة، فيُعاد تنزيلها عند
 * أول فتح بعد التحديث — وإن تعذّر ذلك ظهرت أسماء الأيقونات نصّاً مكان
 * الأيقونات. والخطوط لا تتغيّر مع التطبيق أصلاً فلا معنى لربطها بإصداره.
 */
const FONT_CACHE = 'tahaddi30-fonts';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/icon.svg',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/classify.js',
  './assets/js/config.js',
  './assets/js/datetime.js',
  './assets/js/location.js',
  './assets/js/notifications.js',
  './assets/js/password.js',
  './assets/js/memorize.js',
  './assets/js/prayer.js',
  './assets/js/quran.js',
  './assets/js/qibla.js',
  './assets/js/store.js',
  './assets/js/sync.js',
  './assets/js/sync-shape.js',
  './assets/js/tasks.js',
  './assets/js/theme.js',
  './assets/js/ui.js',
  './assets/js/views/auth-view.js',
  './assets/js/views/chrome.js',
  './assets/js/views/home.js',
  './assets/js/views/memorize.js',
  './assets/js/views/onboarding.js',
  './assets/js/views/prayer-view.js',
  './assets/js/views/settings.js',
  './assets/js/views/tracker.js',
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
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * الخطوط: تُقدَّم من الذاكرة فوراً وتُحدَّث في الخلفية.
 * ولا يُخزَّن إلا ردٌّ ناجح أو مُعتِم (الذي لا يكشف حالته أصلاً)، فردُّ خطأ
 * من خادم الخطوط لا يُخزَّن ليُقدَّم بعد ذلك إلى الأبد.
 */
async function fontResponse(event) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(event.request);

  const update = fetch(event.request).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(event.request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);

  if (hit) {
    event.waitUntil(update);          // التحديث يكمل بعد تقديم النسخة المخزَّنة
    return hit;
  }
  return (await update) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // نقاط المزامنة: من الشبكة دائماً ولا تُخزَّن.
  // لولا هذا الاستثناء لعاد /api/health من الذاكرة، وأعاد عند انقطاع
  // الشبكة صفحةَ index.html بدل JSON فيظهر الخطأ في غير موضعه.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // الخطوط الخارجية: من ذاكرتها المستقلّة، مع تحديث في الخلفية
  if (url.origin !== self.location.origin) {
    event.respondWith(fontResponse(event));
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
