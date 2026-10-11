/**
 * نقطة البداية: التوجيه بين الشاشات، وبوابتا تسجيل الدخول والأذونات.
 */

import { getState, subscribe } from './store.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { schedule } from './notifications.js';
import { clear } from './ui.js';
import { todayKey } from './datetime.js';

import { renderAuth } from './views/auth-view.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderHome, stopCountdown } from './views/home.js';
import { renderPrayer, stopPrayerTimers } from './views/prayer-view.js';
import { renderAddTask } from './views/add-task.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  login:    { render: renderAuth,       public: true },
  welcome:  { render: renderOnboarding, needsAuth: true },
  home:     { render: renderHome,       needsAuth: true, needsOnboarding: true },
  prayer:   { render: renderPrayer,     needsAuth: true, needsOnboarding: true },
  add:      { render: renderAddTask,    needsAuth: true, needsOnboarding: true },
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

function render() {
  const state = getState();
  let name = currentRoute();
  const route = ROUTES[name];

  // البوابات: الدخول أولاً، ثم شاشة الأذونات مرة واحدة
  if (route.needsAuth && !state.user) name = 'login';
  else if (route.needsOnboarding && !state.onboarded) name = 'welcome';
  else if (name === 'login' && state.user) name = state.onboarded ? 'home' : 'welcome';
  else if (name === 'welcome' && state.onboarded) name = 'home';

  teardown();
  clear(root);
  root.className = 'app';
  ROUTES[name].render(root, { rerender: render, navigate });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  document.title = `${titleFor(name)} — تحدي الـ 30`;
}

function titleFor(name) {
  return {
    login: 'تسجيل الدخول',
    welcome: 'الأذونات',
    home: 'المهام اليومية',
    prayer: 'المواقيت والقبلة',
    add: 'إضافة مهمة',
    settings: 'الإعدادات',
  }[name] || 'المهام';
}

/* ------------------------------------------------------------ التشغيل */

applyTheme(getState().settings.theme);
watchSystemTheme();
render();
schedule();

window.addEventListener('hashchange', render);

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

// إعادة جدولة التنبيهات بعد أي تغيّر في الحالة (مع تهدئة لتفادي التكرار)
let scheduleTimer = null;
subscribe(() => {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(schedule, 400);
});

// تسجيل عامل الخدمة للعمل دون اتصال
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* يعمل التطبيق بدونه */ });
  });
}
