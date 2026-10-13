/**
 * رموز الجلسة: JWT مضغوط بتوقيع HS256.
 *
 * التطبيق لا يحتفظ بما دخل به — كلمة سرّ ولا مفتاح — بعد أول تبادل؛ يأخذ
 * بدلاً منه رمز جلسة من هذا الخادم صالحاً تسعين يوماً، فلا يحتاج المستخدم
 * إعادة الدخول على كل جهاز كل ساعة.
 *
 * والرمز موقَّع لا مُسجَّل: لا صفّ له في القاعدة، فلا سبيل لإبطاله قبل انتهاء
 * مدّته. لذلك تغيير كلمة السرّ لا يُخرج الأجهزة الأخرى.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const jsonToB64url = (obj) => toB64url(enc.encode(JSON.stringify(obj)));
const b64urlToJson = (str) => JSON.parse(dec.decode(fromB64url(str)));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** يوقّع حمولة ويعيد الرمز. مدة الصلاحية بالثواني. */
export async function signSession(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${jsonToB64url({ alg: 'HS256', typ: 'JWT' })}.${jsonToB64url(body)}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${toB64url(new Uint8Array(sig))}`;
}

/**
 * يتحقّق من رمز جلسة ويعيد حمولته، أو null إن كان توقيعه خاطئاً أو انتهت صلاحيته.
 * المقارنة تجري داخل crypto.subtle.verify فلا تتسرّب معلومة من زمن التنفيذ.
 */
export async function verifySession(token, secret) {
  try {
    const [head, body, sig] = String(token || '').split('.');
    if (!head || !body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const payload = b64urlToJson(body);
    if (!payload?.sub || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** يفكّ ترميز حمولة JWT دون تحقّق — للقراءة فقط. */
export function decodePayload(token) {
  try {
    return b64urlToJson(String(token).split('.')[1]);
  } catch {
    return null;
  }
}

/** HMAC كامل بترميز b64url — للتخزين والمقارنة لا للعرض. */
export async function mac(value, secret) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(value));
  return toB64url(new Uint8Array(sig));
}

/** بصمة ثابتة لمعرّف الحساب: HMAC بفلفل الخادم، فلا تُعاد القيمة الأصلية من القاعدة. */
export async function fingerprint(value, pepper) {
  return (await mac(value, pepper)).slice(0, 32);
}
