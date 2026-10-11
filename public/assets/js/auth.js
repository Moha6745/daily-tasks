/**
 * تسجيل الدخول: Google أو Apple أو مفتاح مزامنة، مع وضع "ضيف" محلي.
 *
 * الهوية هنا تخدم أمرين: العرض، وفتح جلسة مزامنة على الخادم.
 * رمز Google لا يُؤتمن في العميل — يُرسل كما هو ليتحقّق الخادم من توقيعه،
 * وما يُحفظ بعد ذلك هو رمز جلسة صادر منه.
 *
 * فشل المزامنة لا يمنع الدخول: المستخدم يدخل ويعمل محلياً، ويُبلَّغ بالسبب.
 */

import { AUTH_CONFIG } from './config.js';
import { update, getState } from './store.js';
import { startSession, endSession, normalizeSyncKey } from './sync.js';

export const hasGoogle = () => Boolean(AUTH_CONFIG.googleClientId);
export const hasApple = () => Boolean(AUTH_CONFIG.appleClientId && AUTH_CONFIG.appleRedirectURI);

const scripts = new Map();

function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`تعذّر تحميل ${src}`));
    document.head.appendChild(el);
  });
  scripts.set(src, p);
  return p;
}

/** يفك ترميز حمولة JWT دون التحقق من التوقيع (العرض فقط). */
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(payload).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function signIn(user) {
  update({ user });
  return user;
}

/** يحاول فتح جلسة مزامنة ويعيد رسالة الخطأ إن فشل، أو null عند النجاح. */
async function linkSync(payload) {
  try {
    await startSession(payload);
    return null;
  } catch (err) {
    return err?.message || 'تعذّر تشغيل المزامنة الآن';
  }
}

export function signOut() {
  endSession();
  update({ user: null });
  if (window.google?.accounts?.id) {
    try { window.google.accounts.id.disableAutoSelect(); } catch { /* تجاهل */ }
  }
}

export function currentUser() {
  return getState().user;
}

/** تسجيل الدخول بحساب Google عبر Google Identity Services. */
export async function signInWithGoogle() {
  if (!hasGoogle()) throw new Error('لم يُضبط معرّف Google بعد. راجع assets/js/config.js');
  await loadScript('https://accounts.google.com/gsi/client');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('انتهت مهلة تسجيل الدخول عبر Google')), 120000);
    try {
      window.google.accounts.id.initialize({
        client_id: AUTH_CONFIG.googleClientId,
        callback: async ({ credential }) => {
          clearTimeout(timer);
          const claims = decodeJwt(credential);
          if (!claims) return reject(new Error('تعذّر قراءة بيانات حساب Google'));
          const user = signIn({
            id: claims.sub,
            name: claims.name || claims.email,
            email: claims.email,
            picture: claims.picture || null,
            provider: 'google',
          });
          resolve({ user, syncError: await linkSync({ provider: 'google', idToken: credential }) });
        },
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          clearTimeout(timer);
          reject(new Error('أُغلقت نافذة Google قبل إتمام الدخول'));
        }
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/** يرسم زر Google الرسمي داخل عنصر (يتطلب ضبط المعرّف). */
export async function renderGoogleButton(container, onDone) {
  if (!hasGoogle()) return false;
  await loadScript('https://accounts.google.com/gsi/client');
  window.google.accounts.id.initialize({
    client_id: AUTH_CONFIG.googleClientId,
    callback: async ({ credential }) => {
      const claims = decodeJwt(credential);
      if (!claims) return;
      const user = signIn({
        id: claims.sub,
        name: claims.name || claims.email,
        email: claims.email,
        picture: claims.picture || null,
        provider: 'google',
      });
      onDone({ user, syncError: await linkSync({ provider: 'google', idToken: credential }) });
    },
  });
  window.google.accounts.id.renderButton(container, {
    theme: 'outline', size: 'large', shape: 'pill', locale: 'ar', width: 320,
  });
  return true;
}

/** تسجيل الدخول بحساب Apple عبر Sign in with Apple JS. */
export async function signInWithApple() {
  if (!hasApple()) throw new Error('لم يُضبط معرّف Apple بعد. راجع assets/js/config.js');
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ar_SA/appleid.auth.js');

  window.AppleID.auth.init({
    clientId: AUTH_CONFIG.appleClientId,
    scope: 'name email',
    redirectURI: AUTH_CONFIG.appleRedirectURI,
    usePopup: true,
  });

  /* Apple تبقى هوية عرض فقط: التحقّق من رمزها على الخادم يحتاج مفتاحاً
     خاصاً وJWT مُوقَّعاً من حساب المطوّر، وهو إعداد منفصل لم يُضبط بعد. */
  const res = await window.AppleID.auth.signIn();
  const claims = decodeJwt(res?.authorization?.id_token || '') || {};
  const name = [res?.user?.name?.firstName, res?.user?.name?.lastName].filter(Boolean).join(' ');
  return signIn({
    id: claims.sub || 'apple',
    name: name || claims.email || 'مستخدم Apple',
    email: claims.email || null,
    picture: null,
    provider: 'apple',
  });
}

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
    google: 'الحساب متصل عبر Google',
    apple: 'الحساب متصل عبر Apple ID',
    key: 'حساب بمفتاح مزامنة',
    guest: 'دخول محلي على هذا الجهاز',
  }[provider] || '';
}
