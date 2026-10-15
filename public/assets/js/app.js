/**
 * نقطة البداية: التوجيه بين الشاشات، وبوابتا تسجيل الدخول والأذونات.
 */

import { getState, subscribe } from './store.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { schedule } from './notifications.js';
import { startAutoSync } from './sync.js';
import { clear } from './ui.js';
import { todayKey } from './datetime.js';

import { renderAuth } from './views/auth-view.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderHome, stopCountdown } from './views/home.js';
import { renderPrayer, stopPrayerTimers } from './views/prayer-view.js';
import { renderMemorize } from './views/memorize.js';
import { renderTracker } from './views/tracker.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  login:    { render: renderAuth,       public: true },
  welcome:  { render: renderOnboarding, needsAuth: true },
  home:     { render: renderHome,       needsAuth: true, needsOnboarding: true },
  prayer:   { render: renderPrayer,     needsAuth: true, needsOnboarding: true },
  memorize: { render: renderMemorize,   needsAuth: true, needsOnboarding: true },
  tracker:  { render: renderTracker,    needsAuth: true, needsOnboarding: true },
  settings: { render: renderSettings,   needsAuth: true, needsOnboarding: true },
};

const root = document.getElementById('app');
let lastDay = todayKey();

function currentRoute() {
  const name = (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'home').trim();
  return ROUTES[name] ? name : 'home';
}

export function navigate(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
}

function teardown() {
  stopCountdown();
  stopPrayerTimers();
  document.querySelector('.sheet-backdrop')?.remove();
  document.body.classList.remove('no-scroll');
}

/**
 * لقطة لمواضع التمرير قبل إعادة الرسم.
 *
 * إعادة الرسم تُفرّغ الجذر وتبنيه من جديد، فيعود كل تمرير إلى بدايته:
 * الصفحة إلى أعلاها، والجدول الممرَّر أفقياً إلى أوّله. وذلك صحيح عند
 * الانتقال إلى شاشة أخرى، وخطأ حين تُعاد الشاشة نفسها بعد إنجاز مهمة:
 * القارئ كان عند صفّ في وسط القائمة فيجد نفسه في أعلى الصفحة.
 *
 * أي عنصر يُمرَّر ويريد أن يحفظ موضعه يحمل data-scroll-key.
 */
function scrollSnapshot() {
  const panes = {};
  for (const pane of root.querySelectorAll('[data-scroll-key]')) {
    panes[pane.dataset.scrollKey] = { left: pane.scrollLeft, top: pane.scrollTop };
  }
  return { y: window.scrollY, panes };
}

const jumpTo = (y) => window.scrollTo({ top: y, behavior: 'instant' in window ? 'instant' : 'auto' });

function restoreScroll(snapshot) {
  for (const pane of root.querySelectorAll('[data-scroll-key]')) {
    const saved = snapshot.panes[pane.dataset.scrollKey];
    if (!saved) continue;
    pane.scrollLeft = saved.left;
    pane.scrollTop = saved.top;
  }
  jumpTo(snapshot.y);
}

/** اسم الشاشة المعروضة الآن — به نعرف أن إعادة الرسم لم تنقلنا إلى غيرها. */
let shown = null;

/**
 * @param {{keepScroll?: boolean}} [options] إعادة رسم الشاشة نفسها تبقي
 *   المستخدم في موضعه؛ والانتقال بين الشاشات يبدأ من الأعلى.
 */
function render({ keepScroll = false } = {}) {
  const state = getState();
  let name = currentRoute();
  const route = ROUTES[name];

  // البوابات: الدخول أولاً، ثم شاشة الأذونات مرة واحدة
  if (route.needsAuth && !state.user) name = 'login';
  else if (route.needsOnboarding && !state.onboarded) name = 'welcome';
  else if (name === 'login' && state.user) name = state.onboarded ? 'home' : 'welcome';
  else if (name === 'welcome' && state.onboarded) name = 'home';

  // البوابات أعلاه قد تصرفنا إلى شاشة أخرى، فحفظ الموضع عندها بلا معنى
  const snapshot = keepScroll && shown === name ? scrollSnapshot() : null;

  teardown();
  clear(root);
  root.className = 'app';
  ROUTES[name].render(root, { rerender: () => render({ keepScroll: true }), navigate });
  shown = name;

  if (snapshot) restoreScroll(snapshot);
  else jumpTo(0);
  document.title = `${titleFor(name)} — تحدي الـ 30`;
}

function titleFor(name) {
  return {
    login: 'تسجيل الدخول',
    welcome: 'الأذونات',
    home: 'المهام اليومية',
    prayer: 'المواقيت والقبلة',
    memorize: 'الحفظ',
    tracker: 'جدول تحدي الـ 30',
    settings: 'الإعدادات',
  }[name] || 'المهام';
}

/* ------------------------------------------------------------ التشغيل */

/**
 * يكشف الأيقونات متى صار خطّها جاهزاً.
 * حتى ذلك الحين تُخفيها app.css، وإلا ظهر اسم كل أيقونة نصّاً فأفسد الصفحة.
 *
 * ولا يصلح هنا fonts.check: يعيد true حين لا تُطابق قاعدةُ خطٍّ الاسمَ أصلاً
 * — وهي حال تعذّر ورقة أنماط الخطّ بالضبط — فنسأل fonts.load عن الوجوه
 * المطابقة ونشترط وجودها وتمام تحميلها. ومتصفّح لا يعرف الواجهة تُكشف
 * عنده فوراً: الحجب أسوأ من الانتظار.
 */
function revealIconsWhenReady() {
  const FONT = '24px "Material Symbols Outlined"';
  const root = document.documentElement;

  if (!document.fonts?.load) { root.classList.add('icons-ready'); return; }

  let revealed = false;
  const check = () => {
    if (revealed) return;
    document.fonts.load(FONT).then((faces) => {
      if (revealed || !faces.length || !faces.every((f) => f.status === 'loaded')) return;
      revealed = true;
      root.classList.add('icons-ready');
    }).catch(() => { /* نعاود عند الحدث التالي */ });
  };

  check();
  // ورقة أنماط الخطّ قد تصل بعد هذه اللحظة، فنعاود السؤال عند كل دفعة تحميل
  document.fonts.ready.then(check).catch(() => {});
  document.fonts.addEventListener?.('loadingdone', check);
}

revealIconsWhenReady();
applyTheme(getState().settings.theme);
watchSystemTheme();
render();
schedule();

window.addEventListener('hashchange', () => render());

// إعادة الحساب عند العودة للتطبيق، وتجديد اليوم عند منتصف الليل
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (todayKey() !== lastDay) { lastDay = todayKey(); render(); }
  schedule();
});

// تجديد تلقائي عند تغيّر اليوم والتطبيق مفتوح
setInterval(() => {
  if (todayKey() !== lastDay) { lastDay = todayKey(); render(); schedule(); }
}, 60000);

// المظهر قد يصل من جهاز آخر عبر المزامنة، فنعيد تطبيقه على الصفحة.
// بدون هذا يتغيّر التفضيل في الحالة ولا يتغيّر ما يراه المستخدم حتى يُعاد التحميل.
let lastTheme = getState().settings.theme;
subscribe(() => {
  const theme = getState().settings.theme;
  if (theme === lastTheme) return;
  lastTheme = theme;
  applyTheme(theme);
});

// إعادة جدولة التنبيهات بعد أي تغيّر في الحالة (مع تهدئة لتفادي التكرار)
let scheduleTimer = null;
subscribe(() => {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(schedule, 400);
});

// المزامنة التلقائية: لا تعمل إلا لمن له حساب، ولا تعطّل شيئاً إن تعذّرت
startAutoSync();

// تسجيل عامل الخدمة للعمل دون اتصال
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* يعمل التطبيق بدونه */ });
  });
}
