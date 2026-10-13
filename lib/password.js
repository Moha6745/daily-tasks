/**
 * كلمة السرّ على الخادم: الحساب يُعرف ببصمة معرّفه، ويُتحقَّق ببصمة ناتج
 * الاشتقاق — لا كلمة السرّ ولا الناتج يُحفظان كما وردا.
 *
 * التجزئة الثقيلة جرت في المتصفّح (public/assets/js/password.js) لأن حدّ
 * المعالجة هنا ١٠ms على الخطة المجانية. فلا يبقى للخادم إلا HMAC واحد
 * بفلفله السرّي، وهو ما يجعل تسريب القاعدة وحدها غير كافٍ لتجربة أي تخمين:
 * الفلفل ليس فيها.
 *
 * نرملة المعرّف منسوخة حرفياً من ملف العميل، لأن العميل يشتقّ ملحه منها
 * والخادم يبصم بها. أيّ اختلاف بين النسختين يعني حساباً لا يُفتح.
 */

import { mac, fingerprint } from './jwt.js';

/** ٢٥٦ بت بترميز b64url — طول ثابت، فما خالفه ليس ناتج اشتقاقنا. */
export const DERIVED_CHARS = 43;
const DERIVED_RE = /^[A-Za-z0-9_-]{43}$/;

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;

/** رمز الاسترجاع ٢٤ محرفاً من أبجدية مفتاح المزامنة (≈ ١١٩ بت). */
export const MIN_RECOVERY_CHARS = 20;
export const MAX_RECOVERY_CHARS = 64;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

const toLatinDigits = (text) => text.replace(EASTERN_DIGITS, (d) => {
  const code = d.codePointAt(0);
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** انظر التعليق أعلى الملف: نسخة مطابقة لما في العميل. */
export function normalizeIdentifier(raw) {
  const text = toLatinDigits(String(raw || '').trim());
  if (!text) return null;

  if (text.includes('@')) {
    const value = text.toLowerCase();
    return EMAIL_RE.test(value) ? { kind: 'email', value } : null;
  }

  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('05')) digits = `966${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? { kind: 'phone', value: digits } : null;
}

export const isDerived = (value) => DERIVED_RE.test(String(value || ''));

export const normalizeRecovery = (raw) => String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** بصمة المعرّف: هي مفتاح الصفّ، فلا يُخزَّن البريد ولا الرقم للبحث. */
export const identifierHash = (identifier, pepper) => fingerprint(`id:${identifier.kind}:${identifier.value}`, pepper);

/** ملح لكل حساب: يمنع أن يكشف صفّان متطابقان أن كلمتَي السرّ واحدة. */
export function makeServerSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const verifierOf = (serverSalt, derived, pepper) => mac(`pw:${serverSalt}:${derived}`, pepper);

export const recoveryHashOf = (code, pepper) => mac(`rc:${normalizeRecovery(code)}`, pepper);

/**
 * مقارنة لا يتسرّب منها زمن التنفيذ. الطول يُقارن أولاً وهو ليس سرّاً:
 * كل القيم المقارَنة هنا نواتج HMAC بطول واحد.
 */
export function constantTimeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** الحساب كما يراه التطبيق بعد الدخول. المعرّف الخارجي بصمة لا بريد. */
export const accountOf = (row, identifier = null) => ({
  id: row.account_id,
  provider: 'password',
  email: identifier?.kind === 'email' ? identifier.value : (row.email || null),
  name: identifier ? displayName(identifier) : (row.name || 'حسابي'),
  picture: null,
});

/** اسم العرض: الجزء قبل @ للبريد، والرقم بمقدّمة دولية. */
export const displayName = (identifier) => (
  identifier.kind === 'email' ? identifier.value.split('@')[0] : `+${identifier.value}`
);
