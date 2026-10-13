/**
 * كلمة السرّ: النرملة، والسياسة، واشتقاق المفتاح — في المتصفّح لا في الخادم.
 *
 * الاشتقاق هنا لقيد منصّة لا لتفضيل: دوال Pages على الخطة المجانية تمنح
 * ١٠ms معالجة للطلب الواحد، وPBKDF2 بـ ٦٠٠ ألف دورة يحتاج أضعافها. فيتحمّل
 * المتصفّح العمل الثقيل — ولا حدّ عليه — ويستقبل الخادم الناتج فيختمه بفلفله
 * مرة واحدة قبل التخزين (انظر lib/password.js).
 *
 * كلمة السرّ نفسها لا تُرسَل ولا تُحفظ في أي موضع. والناتج يقوم مقامها في
 * النقل وحده، فتكلفة المهاجم لا تنقص: ليجرّب تخميناً واحداً عليه أن يشتقّ
 * ٦٠٠ ألف دورة بنفسه، سواء جُزّئت كلمة السرّ في الخادم أو هنا.
 *
 * والملح يُشتقّ من المعرّف لا عشوائياً، كي يحسبه المتصفّح قبل أن يعرف عن
 * الحساب شيئاً. ولو كان عشوائياً لوجب جلبه من الخادم بالبريد، فيصير الخادم
 * مُخبِراً عن وجود كل حساب يُسأل عنه.
 *
 * نرملة المعرّف منسوخة حرفياً في lib/password.js لأن الخادم يبصم المعرّف
 * المنرمَل بنفسه. اختلاف الملفّين يعني حساباً لا يُفتح، فأيّ تعديل هنا
 * يُنقل هناك.
 */

const enc = new TextEncoder();

/** ٦٠٠ ألف دورة — توصية OWASP لـ PBKDF2-SHA256. تُرسَل مع الحساب لترقية لاحقة. */
export const KDF_ITERATIONS = 600000;

const SALT_PREFIX = 'tahaddi30:kdf:v1:';

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

/* الأرقام العربية والفارسية تُحوَّل لاتينية: من يكتب رقمه بلوحة عربية
   يجب أن يفتح الحساب نفسه الذي أنشأه بلوحة لاتينية. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

const toLatinDigits = (text) => text.replace(EASTERN_DIGITS, (d) => {
  const code = d.codePointAt(0);
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * يعيد `{kind, value}` للمعرّف المنرمَل، أو `null` إن لم يكن بريداً ولا رقماً.
 *
 * الرقم المحلي السعودي (`05XXXXXXXX`) يُحوَّل إلى `9665XXXXXXXX`، وإلا لصار
 * الرقم الواحد حسابين: واحداً لمن كتبه محلياً وآخر لمن كتبه بمقدّمة الدولة.
 * ومن هو خارج السعودية يكتب رقمه بمقدّمة دولته كاملة.
 */
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

/** عرض المعرّف كما يفهمه المستخدم: الرقم بمقدّمة دولية، والبريد كما هو. */
export const formatIdentifier = (identifier) => (
  identifier?.kind === 'phone' ? `+${identifier.value}` : (identifier?.value || '')
);

/* ------------------------------------------------------------------ السياسة */

/* كلمات السرّ الأكثر شيوعاً مما يصلح للطول المطلوب. القائمة قصيرة مقصودة:
   حدّ الطول وحده يستبعد أكثر الشائع، وهذه تسدّ ما ينجو منه. */
const COMMON = new Set([
  '1234567890', '0123456789', '123456789', '1234567891', '12345678910',
  'password12', 'password123', 'password1234', 'passw0rd12', 'qwertyuiop',
  'qwerty1234', 'qwerty12345', 'abcd123456', 'abc123456789', 'iloveyou12',
  'letmein123', 'welcome123', 'admin12345', 'administrator', 'zxcvbnmasd',
  'asdfghjkl1', 'aaaaaaaaaa', '1111111111', '0000000000', 'الله اكبر',
]);

const SEQUENCES = ['0123456789012345', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];

/** يعيد سبب رفض كلمة السرّ، أو `null` إن قُبلت. العرض فقط — الخادم لا يراها. */
export function passwordProblem(password, identifier = null) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD) return `كلمة السرّ أقصر من ${MIN_PASSWORD} محارف.`;
  if (value.length > MAX_PASSWORD) return `كلمة السرّ أطول من ${MAX_PASSWORD} محرفاً.`;
  if (value.trim().length !== value.length) return 'لا تبدأ كلمة السرّ بمسافة ولا تنتهي بها.';

  const lower = value.toLowerCase();
  if (COMMON.has(lower)) return 'هذه من أكثر كلمات السرّ شيوعاً — اختر غيرها.';
  if (new Set(lower).size <= 2) return 'كلمة السرّ تكرار لمحرفين — اختر غيرها.';
  if (SEQUENCES.some((seq) => seq.includes(lower) || [...seq].reverse().join('').includes(lower))) {
    return 'كلمة السرّ تسلسل على لوحة المفاتيح — اختر غيرها.';
  }

  const id = identifier?.value || '';
  if (id && (lower.includes(id.toLowerCase()) || lower.includes(id.split('@')[0].toLowerCase()))) {
    return 'كلمة السرّ تحتوي معرّف حسابك — اختر غيرها.';
  }
  return null;
}

/** تقدير تقريبي للعرض: الطول أولاً ثم تنوّع المحارف. */
export function passwordStrength(password) {
  const value = String(password || '');
  if (!value) return { score: 0, label: '' };

  const families = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /[؀-ۿ]/].filter((re) => re.test(value)).length;
  const span = Math.min(3, Math.floor(value.length / 6));          // ٠..٣ بالطول
  const variety = Math.min(2, Math.max(0, families - 1));          // ٠..٢ بالتنوّع
  const unique = new Set(value).size >= value.length / 2 ? 1 : 0;
  const score = Math.max(1, Math.min(4, span + variety + unique - 1));

  return { score, label: ['ضعيفة', 'متوسّطة', 'جيّدة', 'قوية'][score - 1] };
}

/* ----------------------------------------------------------------- الاشتقاق */

const toB64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * يشتقّ مفتاح كلمة السرّ (٢٥٦ بت بترميز b64url). ثقيل بالقصد — نحو نصف
 * ثانية على الجوال — فأظهر حالة انتظار قبل ندائه.
 * @param {{kind:string, value:string}} identifier معرّف منرمَل من `normalizeIdentifier`
 */
export async function deriveKey(identifier, password) {
  const salt = new Uint8Array(
    await crypto.subtle.digest('SHA-256', enc.encode(`${SALT_PREFIX}${identifier.kind}:${identifier.value}`)),
  );
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toB64url(new Uint8Array(bits));
}
