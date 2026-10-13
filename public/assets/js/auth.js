/**
 * تسجيل الدخول: بريد أو رقم جوال مع كلمة سرّ، أو مفتاح مزامنة، أو دخول
 * محلي كضيف. لا مقدّم هوية خارجياً ولا سكربت من نطاق آخر.
 *
 * كلمة السرّ لا تترك الجهاز: يشتقّ منها المتصفّح مفتاحاً بـ PBKDF2 ويرسل
 * الناتج وحده (password.js). والخادم يتحقّق منه فيردّ رمز جلسة هو ما يُحفظ
 * بعد ذلك.
 *
 * فرق مقصود عن الضيف والمفتاح: حساب كلمة السرّ لا يُفتح دون اتصال في أول
 * دخول على الجهاز، لأن التحقّق في الخادم لا هنا. وبعد نجاح أول دخول تبقى
 * الجلسة تسعين يوماً فيعمل التطبيق كاملاً دون شبكة.
 *
 * رمز الاسترجاع يُولَّد في الجهاز ويُعرض مرة واحدة ولا يُحفظ منه إلا بصمته
 * على الخادم. لا بريد تحقّق ولا رسالة SMS: إرسالهما يحتاج نطاقاً مُتحقَّقاً
 * أو مزوّداً مدفوعاً، والرمز يسدّ مسدّهما لاسترجاع الحساب (DEPLOY.md §٤.د).
 */

import { update, getState } from './store.js';
import {
  startSession, endSession, apiPost, sessionToken,
  normalizeSyncKey, generateSyncKey,
} from './sync.js';
import {
  normalizeIdentifier, deriveKey, passwordProblem, formatIdentifier,
  KDF_ITERATIONS,
} from './password.js';

function signIn(user) {
  update({ user });
  return user;
}

/** المستخدم كما يُعرض محلياً. `identifier` يبقى لأن اشتقاق المفتاح يحتاجه. */
const passwordUser = (identifier, account) => ({
  id: account?.id || `pw:${identifier.kind}:${identifier.value}`,
  name: account?.name || formatIdentifier(identifier),
  email: identifier.kind === 'email' ? identifier.value : null,
  phone: identifier.kind === 'phone' ? `+${identifier.value}` : null,
  identifier,
  picture: null,
  provider: 'password',
});

/** يقرأ المعرّف ويرمي رسالة عربية إن لم يكن بريداً ولا رقماً. */
function requireIdentifier(raw) {
  const identifier = normalizeIdentifier(raw);
  if (!identifier) throw new Error('أدخل بريداً صحيحاً أو رقم جوال بمقدّمة دولته.');
  return identifier;
}

function requirePassword(password, identifier) {
  const problem = passwordProblem(password, identifier);
  if (problem) throw new Error(problem);
}

/** يحوّل تعذّر الوصول إلى رسالة تقول السبب الحقيقي: لا شبكة لا كلمة سرّ. */
function offlineHint(err) {
  if (err instanceof TypeError || err.code === 'http_0') {
    return new Error('يلزم اتصال بالإنترنت لأول دخول على هذا الجهاز.');
  }
  return err;
}

export function signOut() {
  endSession();
  update({ user: null });
}

export function currentUser() {
  return getState().user;
}

/* ------------------------------------------------------- حساب بكلمة السرّ */

/**
 * ينشئ حساباً جديداً ويفتح جلسته.
 * يعيد `{user, recovery}` — ورمز الاسترجاع يُعرض مرة واحدة ولا يُستعاد.
 */
export async function registerWithPassword({ identifier: raw, password }) {
  const identifier = requireIdentifier(raw);
  requirePassword(password, identifier);

  const recovery = generateSyncKey();
  const derived = await deriveKey(identifier, password);

  try {
    await apiPost('account', {
      body: {
        action: 'register',
        identifier: identifier.value,
        derived,
        recovery,
        iterations: KDF_ITERATIONS,
      },
    });
  } catch (err) {
    throw offlineHint(err);
  }

  const account = await startSession({ provider: 'password', identifier, derived });
  return { user: signIn(passwordUser(identifier, account)), recovery };
}

/** يدخل بحساب قائم. يرمي رسالة الخادم كما هي (كلمة سرّ خاطئة، قفل مؤقّت...). */
export async function signInWithPassword({ identifier: raw, password }) {
  const identifier = requireIdentifier(raw);
  if (!String(password || '')) throw new Error('أدخل كلمة السرّ.');

  const derived = await deriveKey(identifier, password);
  try {
    const account = await startSession({ provider: 'password', identifier, derived });
    return signIn(passwordUser(identifier, account));
  } catch (err) {
    throw offlineHint(err);
  }
}

/**
 * يستعيد الحساب برمز الاسترجاع ويضع كلمة سرّ جديدة.
 * الرمز يُستبدل بآخر جديد يُعرض للمستخدم، لأن المستعمَل مرة قد يكون انكشف.
 */
export async function resetPasswordWithRecovery({ identifier: raw, recovery, password }) {
  const identifier = requireIdentifier(raw);
  const code = normalizeSyncKey(recovery);
  if (code.length < 20) throw new Error('رمز الاسترجاع قصير. انسخه كاملاً كما ظهر عند إنشاء الحساب.');
  requirePassword(password, identifier);

  const nextRecovery = generateSyncKey();
  const derived = await deriveKey(identifier, password);

  try {
    await apiPost('account', {
      body: {
        action: 'reset',
        identifier: identifier.value,
        recovery: code,
        derived,
        nextRecovery,
        iterations: KDF_ITERATIONS,
      },
    });
  } catch (err) {
    throw offlineHint(err);
  }

  const account = await startSession({ provider: 'password', identifier, derived });
  return { user: signIn(passwordUser(identifier, account)), recovery: nextRecovery };
}

/**
 * يغيّر كلمة سرّ الحساب الحالي. يتطلّب جلسة قائمة وكلمة السرّ الحالية.
 *
 * الجلسات على الأجهزة الأخرى تبقى صالحة: رمز الجلسة موقّع لا مُسجَّل، فلا
 * سبيل لإبطاله من الخادم. فمن غيّر كلمة سرّه لأن أحداً عرفها عليه تسجيل
 * الخروج من ذلك الجهاز بنفسه.
 */
export async function changePassword({ current, next }) {
  const user = currentUser();
  if (user?.provider !== 'password' || !user.identifier) {
    throw new Error('هذا الحساب لا يدخل بكلمة سرّ.');
  }
  const token = sessionToken();
  if (!token) throw new Error('انتهت الجلسة. أعد الدخول ثم غيّر كلمة السرّ.');

  const identifier = user.identifier;
  requirePassword(next, identifier);
  if (current === next) throw new Error('كلمة السرّ الجديدة مثل الحالية.');

  const [derived, nextDerived] = await Promise.all([
    deriveKey(identifier, current),
    deriveKey(identifier, next),
  ]);

  const nextRecovery = generateSyncKey();
  try {
    await apiPost('account', {
      body: { action: 'change', derived, next: nextDerived, nextRecovery, iterations: KDF_ITERATIONS },
      token,
    });
  } catch (err) {
    throw offlineHint(err);
  }
  return { recovery: nextRecovery };
}

/* ---------------------------------------------------------- مفتاح وضيف */

/**
 * دخول بمفتاح مزامنة. المفتاح هو الحساب وكلمة السرّ معاً:
 * من يملكه يملك البيانات، ولا سبيل لاسترجاعه إن فُقد.
 */
export async function signInWithSyncKey(rawKey) {
  const key = normalizeSyncKey(rawKey);
  if (key.length < 20) throw new Error('المفتاح قصير. انسخه كاملاً كما ظهر على الجهاز الأول.');
  const account = await startSession({ provider: 'key', syncKey: key });
  return signIn({
    id: account.id,
    name: 'حسابي',
    email: null,
    picture: null,
    provider: 'key',
  });
}

/** دخول محلي بلا حساب — كل البيانات تبقى على هذا الجهاز. */
export function signInAsGuest(name = 'ضيف') {
  return signIn({
    id: `guest_${Math.random().toString(36).slice(2, 10)}`,
    name,
    email: null,
    picture: null,
    provider: 'guest',
  });
}

export function providerLabel(provider) {
  return {
    password: 'حساب بكلمة سرّ',
    key: 'حساب بمفتاح مزامنة',
    guest: 'دخول محلي على هذا الجهاز',
  }[provider] || '';
}
