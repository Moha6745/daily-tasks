/**
 * التخزين المحلي لحالة التطبيق.
 * كل شيء يُحفظ في localStorage تحت مفتاح واحد، وهو مصدر الحقيقة على هذا الجهاز.
 * المزامنة (sync.js) تبني فوقه ولا تحلّ محلّه: التطبيق يعمل كاملاً دونها.
 */

import { syncedSettings, challengeDoc, memorizeDoc } from './sync-shape.js';

const KEY = 'tahaddi30:v1';

const DEFAULTS = Object.freeze({
  version: 1,
  user: null,              // {id, name, email, picture, provider}
  onboarded: false,        // هل عُرضت شاشة الأذونات من قبل؟ (خاصّ بهذا الجهاز)
  tasks: [],
  trash: [],               // شواهد الحذف [{id, updatedAt}] كي يصل الحذف لبقية الأجهزة
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
  /* خطة حفظ القرآن: حجم الورد اليومي، والأوجه المحفوظة وتواريخها */
  memorize: {
    pagesPerDay: 1,              // عدد الأوجه في الورد الواحد
    pages: {},                   // { '<رقم الوجه>': 'YYYY-MM-DD' }
  },
  /* طوابع آخر تغيير للمستندات المفردة — بها يُحسم التعارض عند المزامنة */
  stamps: {
    settings: 0,
    challenge: 0,
    memorize: 0,
  },
  /* حالة المزامنة على هذا الجهاز. تبقى محلية ولا تُرسل ولا تُصدَّر. */
  sync: {
    token: null,
    expiresAt: null,
    account: null,
    key: null,                   // مفتاح المزامنة إن استُخدم (سرّ بحجم كلمة السرّ)
    cursor: 0,
    pushedSignature: 0,
    status: 'off',
    lastSyncAt: null,
    lastError: null,
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

/**
 * ترقية حالة محفوظة قبل المزامنة: المهام القديمة بلا updatedAt.
 * نشتقّه من createdAt لا من الآن، فيبقى الطابع معبّراً عن واقع المهمة
 * ولا يتفوّق جهازٌ على آخر لمجرّد أنه فُتح متأخراً.
 */
function migrate(state) {
  const tasks = (state.tasks || []).map((task) => {
    const out = { ...task };
    // النسخ السابقة عرفت التكرار اليومي وحده عبر repeatDaily
    if (out.repeat !== 'none' && out.repeat !== 'daily' && out.repeat !== 'weekly') {
      out.repeat = out.repeatDaily ? 'daily' : 'none';
    }
    if (Number.isFinite(out.updatedAt)) return out;
    const from = Date.parse(out.doneAt || out.createdAt || '');
    out.updatedAt = Number.isFinite(from) ? from : Date.now();
    return out;
  });
  return { ...state, tasks };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    return migrate(deepMerge(clone(DEFAULTS), JSON.parse(raw)));
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

/**
 * يطبع طابعاً زمنياً على ما تغيّر من المستندات المفردة.
 * يجري هنا مركزياً لا في مواضع النداء: الإعدادات تُعدَّل من شاشة الإعدادات
 * ومن الموقع ومن الإشعارات، ونسيان الطابع في أحدها يعني تغييراً لا يُزامن.
 */
function restamp(before, after) {
  const stamps = { ...after.stamps };
  const at = Date.now();
  if (JSON.stringify(syncedSettings(before.settings)) !== JSON.stringify(syncedSettings(after.settings))) {
    stamps.settings = at;
  }
  if (JSON.stringify(challengeDoc(before.challenge)) !== JSON.stringify(challengeDoc(after.challenge))) {
    stamps.challenge = at;
  }
  if (JSON.stringify(memorizeDoc(before.memorize)) !== JSON.stringify(memorizeDoc(after.memorize))) {
    stamps.memorize = at;
  }
  return stamps;
}

/** يحدّث الحالة بدمج جزئي ثم يُخطر المشتركين. */
export function update(patch, { silent = false } = {}) {
  const before = state;
  const next = deepMerge(state, typeof patch === 'function' ? patch(state) : patch);
  state = { ...next, stamps: restamp(before, next) };
  persist();
  if (!silent) listeners.forEach((fn) => fn(state));
  return state;
}

/**
 * يطبّق ما وصل من الخادم.
 * يأخذ طوابع الخادم كما هي ولا يعيد طبعها، وإلا بدا كل سحب تغييراً محلياً
 * جديداً فدفعه الجهاز مرة أخرى في جولة لا تنتهي.
 */
export function applyRemote({ tasks, trash, settings, challenge, memorize, stamps }) {
  state = {
    ...state,
    ...(tasks ? { tasks } : {}),
    ...(trash ? { trash } : {}),
    ...(settings ? { settings: { ...state.settings, ...settings } } : {}),
    ...(challenge ? { challenge: { ...state.challenge, ...challenge } } : {}),
    // الأوجه تُستبدل لا تُدمج، وإلا لم يصل مسحُ وجهٍ من جهاز آخر
    ...(memorize ? { memorize: { ...state.memorize, ...memorize } } : {}),
    ...(stamps ? { stamps: { ...state.stamps, ...stamps } } : {}),
  };
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

/**
 * يستبدل خطة الحفظ بالكامل.
 * لا يصلح update هنا: دمجه العميق يُبقي المفاتيح الغائبة عن الجديد، فإلغاءُ
 * حفظ وجهٍ — أو تصفير الخطة — لا يصل إلى الحالة أبداً وتبقى العلامة كما هي.
 */
export function setMemorize(memorize) {
  const before = state;
  const next = { ...state, memorize };
  state = { ...next, stamps: restamp(before, next) };
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

/** يستبدل مصفوفة المهام بالكامل (إضافة/حذف/ترتيب). */
export function setTasks(tasks) {
  state = { ...state, tasks };
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

/**
 * يمسح كل بيانات هذا الجهاز ويطفئ المزامنة عليه.
 * بيانات الخادم لا تُمسح من هنا؛ الدخول بالحساب نفسه يعيدها.
 */
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
