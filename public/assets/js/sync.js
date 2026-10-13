/**
 * محرّك المزامنة في العميل.
 *
 * دورة واحدة: يدفع الحالة المحلية كاملة ويسحب ما تغيّر على الخادم بعد المؤشّر،
 * ثم يدمج بقاعدة «الأحدث يفوز» لكل سجل على حدة.
 *
 * ثلاثة مبادئ تحكم السلوك:
 *   • التطبيق يعمل كاملاً دون مزامنة. أي خطأ هنا لا يعطّل شاشة ولا يمنع إضافة مهمة.
 *   • لا مزامنة لمستخدم «ضيف»؛ المزامنة تبدأ بحساب فقط.
 *   • الفشل لا يتحوّل إلى عاصفة طلبات: تباطؤ تصاعدي، وتوقّف عن المحاولة
 *     حين يقول الخادم إن المزامنة غير مُعدّة.
 */

import { getState, update, applyRemote, subscribe } from './store.js';
import { syncedSettings, challengeDoc, memorizeDoc, localSignature, TRASH_TTL_MS } from './sync-shape.js';

const API = './api';
const AUTO_INTERVAL_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 1500;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

let debounceTimer = null;
let intervalTimer = null;
let inFlight = null;
let applying = false;          // يمنع المزامنة من إيقاظ نفسها بتغييراتها
let backoffMs = 0;
let quietUntil = 0;            // متى يُسمح بمحاولة جديدة بعد فشل

const now = () => Date.now();
const syncOf = (state = getState()) => state.sync || {};

/** هل المزامنة قيد التشغيل (حساب متصل)؟ */
export const isSyncing = () => Boolean(syncOf().token);

export function syncStatus() {
  const sync = syncOf();
  return {
    active: Boolean(sync.token),
    account: sync.account || null,
    status: sync.status || 'off',
    lastSyncAt: sync.lastSyncAt || null,
    lastError: sync.lastError || null,
    pending: localSignature(getState()) > (sync.pushedSignature || 0),
  };
}

function setSync(patch) {
  applying = true;
  try {
    update({ sync: patch });
  } finally {
    applying = false;
  }
}

/* ------------------------------------------------------------- مفتاح المزامنة */

const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // بلا I O L 0 1 لئلا تُقرأ خطأً

/** مفتاح جديد: ٢٤ محرفاً ≈ ١١٩ بت عشوائية. */
export function generateSyncKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += KEY_ALPHABET[b % KEY_ALPHABET.length];
  return out;
}

/** يعرض المفتاح مجموعات رباعية ليسهل نقله بين الأجهزة. */
export const formatSyncKey = (key) => String(key || '').replace(/(.{4})(?=.)/g, '$1-');

export const normalizeSyncKey = (key) => String(key || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/* ------------------------------------------------------------------- الطلبات */

export async function apiPost(path, { body, token } = {}) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  let payload = null;
  try { payload = await res.json(); } catch { /* ردّ بلا JSON */ }

  if (!res.ok) {
    const err = new Error(payload?.error?.message || `فشل الطلب (${res.status})`);
    err.code = payload?.error?.code || `http_${res.status}`;
    err.status = res.status;
    throw err;
  }
  return payload;
}

/** يسأل الخادم عمّا هو مُعدّ فعلاً — تُستخدم في شاشة الإعدادات للتشخيص. */
export async function probeServer() {
  try {
    const res = await fetch(`${API}/health`, { headers: { 'cache-control': 'no-cache' } });
    return { reachable: true, ...(await res.json()) };
  } catch {
    return { reachable: false, ready: false, providers: {} };
  }
}

/* -------------------------------------------------------------------- الجلسة */

/** رمز الجلسة الحالي — تحتاجه نقاط النهاية التي تطلب مصادقة. */
export const sessionToken = () => syncOf().token || null;

/**
 * يبدأ جلسة مزامنة ويزامن فوراً.
 * @param {{provider:'password'|'key', identifier?:object, derived?:string, syncKey?:string}} input
 */
export async function startSession(input) {
  const body = input.provider === 'password'
    ? { provider: 'password', identifier: input.identifier.value, derived: input.derived }
    : { provider: 'key', syncKey: normalizeSyncKey(input.syncKey) };

  const res = await apiPost('session', { body });

  setSync({
    token: res.token,
    expiresAt: res.expiresAt,
    account: res.account,
    key: input.provider === 'key' ? normalizeSyncKey(input.syncKey) : null,
    cursor: 0,                 // حساب جديد على هذا الجهاز: اسحب كل شيء
    pushedSignature: 0,
    status: 'idle',
    lastError: null,
  });

  quietUntil = 0;
  backoffMs = 0;
  await syncNow({ force: true });
  return res.account;
}

/** يوقف المزامنة على هذا الجهاز. البيانات المحلية تبقى كما هي. */
export function endSession() {
  stopAutoSync();
  setSync({
    token: null, expiresAt: null, account: null, key: null,
    cursor: 0, pushedSignature: 0, status: 'off', lastError: null, lastSyncAt: null,
  });
}

/* --------------------------------------------------------------------- الدمج */

function pruneTrash(trash) {
  const cutoff = now() - TRASH_TTL_MS;
  return (trash || []).filter((row) => (Number(row.updatedAt) || 0) > cutoff);
}

/** يدمج ردّ الخادم في الحالة المحلية. يعيد عدد السجلات التي تغيّرت فعلاً. */
function mergeIncoming(res) {
  const state = getState();
  const byId = new Map((state.tasks || []).map((t) => [t.id, t]));
  const tombById = new Map((state.trash || []).map((r) => [r.id, r]));

  let tasks = [...(state.tasks || [])];
  let trash = [...(state.trash || [])];
  let changed = 0;

  for (const row of res.tasks || []) {
    const localStamp = Math.max(
      Number(byId.get(row.id)?.updatedAt) || 0,
      Number(tombById.get(row.id)?.updatedAt) || 0,
    );
    if (!(row.updatedAt > localStamp)) continue;   // المحلي أحدث أو مساوٍ: يفوز

    changed += 1;
    if (row.deleted) {
      tasks = tasks.filter((t) => t.id !== row.id);
      trash = [...trash.filter((r) => r.id !== row.id), { id: row.id, updatedAt: row.updatedAt }];
    } else if (row.payload) {
      const merged = { ...row.payload, id: row.id, updatedAt: row.updatedAt };
      tasks = byId.has(row.id) ? tasks.map((t) => (t.id === row.id ? merged : t)) : [...tasks, merged];
      trash = trash.filter((r) => r.id !== row.id);
    }
  }

  /* المستندات المفردة: تُطبَّق بطابع الخادم نفسه كي لا تبدو «أحدث» في الجولة التالية */
  const remote = {};
  const stamps = { ...(state.stamps || {}) };
  for (const [kind, doc] of Object.entries(res.docs || {})) {
    if (!doc || !(doc.updatedAt > (Number(stamps[kind]) || 0))) continue;
    remote[kind] = doc.payload;
    stamps[kind] = doc.updatedAt;
    changed += 1;
  }

  applying = true;
  try {
    if (changed) {
      const pruned = pruneTrash(trash);
      applyRemote({
        tasks, trash: pruned, stamps,
        settings: remote.settings, challenge: remote.challenge, memorize: remote.memorize,
      });
    }
  } finally {
    applying = false;
  }
  return changed;
}

/* ----------------------------------------------------------------- المزامنة */

function buildPayload(state) {
  const tasks = (state.tasks || []).map((task) => ({
    id: task.id,
    updatedAt: Number(task.updatedAt) || 1,
    deleted: false,
    payload: task,
  }));

  const trash = pruneTrash(state.trash).map((row) => ({
    id: row.id,
    updatedAt: Number(row.updatedAt) || 1,
    deleted: true,
  }));

  const docs = {};
  if (state.stamps?.settings) {
    docs.settings = { updatedAt: state.stamps.settings, payload: syncedSettings(state.settings) };
  }
  if (state.stamps?.challenge) {
    docs.challenge = { updatedAt: state.stamps.challenge, payload: challengeDoc(state.challenge) };
  }
  if (state.stamps?.memorize) {
    docs.memorize = { updatedAt: state.stamps.memorize, payload: memorizeDoc(state.memorize) };
  }

  return { since: Number(state.sync?.cursor) || 0, tasks: [...tasks, ...trash], docs };
}

/**
 * جولة مزامنة واحدة. آمنة للنداء في أي وقت: تتجاهل النداء إن لم يكن
 * هناك حساب، أو إن كانت جولة جارية، أو إن كنا في فترة تهدئة بعد فشل.
 */
export async function syncNow({ force = false } = {}) {
  const sync = syncOf();
  if (!sync.token) return { skipped: 'off' };
  if (inFlight) return inFlight;
  if (!force && now() < quietUntil) return { skipped: 'backoff' };
  if (!navigator.onLine) {
    setSync({ status: 'offline' });
    return { skipped: 'offline' };
  }

  const state = getState();
  const signature = localSignature(state);
  setSync({ status: 'syncing' });

  inFlight = (async () => {
    try {
      const res = await apiPost('sync', { body: buildPayload(state), token: sync.token });
      const changed = mergeIncoming(res);

      setSync({
        cursor: Number(res.rev) || 0,
        pushedSignature: signature,
        lastSyncAt: now(),
        status: 'ok',
        lastError: null,
      });

      backoffMs = 0;
      quietUntil = 0;
      return { ok: true, changed, applied: res.applied || 0 };
    } catch (err) {
      /* انتهاء الجلسة: نطفئ المزامنة بهدوء ونطلب الدخول من جديد */
      if (err.status === 401) {
        setSync({ token: null, status: 'expired', lastError: err.message });
        stopAutoSync();
        return { ok: false, error: err.message };
      }
      /* الخادم غير مُعدّ: لا جدوى من إعادة المحاولة كل دقيقة */
      if (err.code === 'not_configured' || err.status === 503) {
        quietUntil = now() + 30 * 60 * 1000;
        setSync({ status: 'unavailable', lastError: err.message });
        return { ok: false, error: err.message };
      }
      backoffMs = Math.min(backoffMs ? backoffMs * 2 : 15000, MAX_BACKOFF_MS);
      quietUntil = now() + backoffMs;
      setSync({ status: 'error', lastError: err.message });
      return { ok: false, error: err.message };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function scheduleSync(delay = DEBOUNCE_MS) {
  if (!isSyncing()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncNow(), delay);
}

/** يبدأ المزامنة التلقائية: عند التغيير، وعند عودة التطبيق للمقدّمة، ودورياً. */
export function startAutoSync() {
  if (intervalTimer) return;

  intervalTimer = setInterval(() => syncNow(), AUTO_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });

  window.addEventListener('online', () => syncNow({ force: true }));

  /* أي تغيير محلي يستحق الدفع — مع تجاهل تغييرات المزامنة نفسها */
  let lastSignature = localSignature(getState());
  subscribe(() => {
    if (applying) return;
    const signature = localSignature(getState());
    if (signature === lastSignature) return;
    lastSignature = signature;
    scheduleSync();
  });

  if (isSyncing()) syncNow({ force: true });
}

export function stopAutoSync() {
  clearInterval(intervalTimer);
  intervalTimer = null;
  clearTimeout(debounceTimer);
}
