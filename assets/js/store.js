/**
 * التخزين المحلي لحالة التطبيق.
 * كل شيء يُحفظ في localStorage تحت مفتاح واحد؛ لا يوجد خادم.
 */

const KEY = 'tahaddi30:v1';

const DEFAULTS = Object.freeze({
  version: 1,
  user: null,              // {id, name, email, picture, provider}
  onboarded: false,        // هل عُرضت شاشة الأذونات من قبل؟
  tasks: [],
  settings: {
    theme: 'system',             // system | light | dark
    locationEnabled: false,
    notificationsEnabled: false,
    fajrReminder: true,
    fajrReminderTime: '05:00',
    nightReminder: true,
    nightReminderTime: '23:00',
    prayerAlerts: false,
    prayerAlertLead: 15,         // دقائق قبل الأذان
    calcMethod: 'umm_al_qura',
    asrMethod: 'standard',       // standard (شافعي) | hanafi
    coords: null,                // {lat, lon, label, accuracy, source}
  },
  challenge: {
    startDate: null,             // 'YYYY-MM-DD' أول يوم في التحدي
    length: 30,
  },
});

function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && base[k] !== null)
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    return deepMerge(clone(DEFAULTS), JSON.parse(raw));
  } catch {
    return clone(DEFAULTS);
  }
}

let state = read();
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* وضع التصفح الخاص أو امتلاء المساحة — نواصل بالذاكرة فقط */
  }
}

/** يحدّث الحالة بدمج جزئي ثم يُخطر المشتركين. */
export function update(patch, { silent = false } = {}) {
  state = deepMerge(state, typeof patch === 'function' ? patch(state) : patch);
  persist();
  if (!silent) listeners.forEach((fn) => fn(state));
  return state;
}

/** يستبدل مصفوفة المهام بالكامل (إضافة/حذف/ترتيب). */
export function setTasks(tasks) {
  state = { ...state, tasks };
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* تجاهل */ }
  state = clone(DEFAULTS);
  listeners.forEach((fn) => fn(state));
  return state;
}

/* مزامنة بين تبويبات المتصفح المفتوحة */
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = read();
  listeners.forEach((fn) => fn(state));
});
