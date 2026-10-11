/**
 * التحقّق من رمز هوية Google (ID token) بتوقيع RS256 مقابل مفاتيح Google المعلنة.
 *
 * لا نكتفي بفكّ ترميز الحمولة كما يفعل العميل للعرض: أي كان يستطيع تلفيق
 * حمولة تقول إنه صاحب بريد ما. التحقّق من التوقيع هو ما يجعل الحساب حقيقياً.
 */

import { fromB64url, decodePayload } from './jwt.js';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let cache = { keys: null, expiresAt: 0 };

async function jwks() {
  if (cache.keys && cache.expiresAt > Date.now()) return cache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`تعذّر جلب مفاتيح Google (${res.status})`);
  const body = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]);
  cache = {
    keys: body.keys || [],
    expiresAt: Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 3600) * 1000,
  };
  return cache.keys;
}

function kidOf(token) {
  try {
    const head = JSON.parse(new TextDecoder().decode(fromB64url(String(token).split('.')[0])));
    return head?.kid || null;
  } catch {
    return null;
  }
}

/**
 * يتحقّق من الرمز ويعيد مطالباته، أو يرمي خطأً مفهوماً.
 * @param {string} idToken
 * @param {string} clientId معرّف العميل المسجّل — الرمز الموجَّه لتطبيق آخر يُرفض.
 */
export async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('رمز هوية Google غير صالح');

  const kid = kidOf(idToken);
  const keys = await jwks();
  const jwk = keys.find((k) => k.kid === kid) || null;
  if (!jwk) throw new Error('مفتاح توقيع Google غير معروف');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), signed);
  if (!ok) throw new Error('توقيع رمز Google لا يطابق مفاتيحها');

  const claims = decodePayload(idToken);
  if (!claims) throw new Error('تعذّر قراءة حمولة رمز Google');

  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.has(claims.iss)) throw new Error('جهة إصدار الرمز ليست Google');
  if (claims.aud !== clientId) throw new Error('الرمز صادر لتطبيق آخر');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('انتهت صلاحية رمز Google');
  if (typeof claims.iat === 'number' && claims.iat > now + 300) throw new Error('زمن إصدار الرمز في المستقبل');
  if (!claims.sub) throw new Error('الرمز بلا معرّف مستخدم');

  return claims;
}
