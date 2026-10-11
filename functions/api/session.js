/**
 * بدء جلسة مزامنة.
 *
 * مقدِّمان للهوية:
 *   • google — رمز هوية من Google يُتحقَّق من توقيعه هنا (الحساب الحقيقي).
 *   • key    — مفتاح مزامنة يولّده التطبيق عشوائياً على الجهاز الأول،
 *              فيصلح حين لا يريد المستخدم ضبط OAuth. المفتاح هو كلمة
 *              السرّ نفسها: من يملكه يملك البيانات، ولا يمكن استرجاعه إن فُقد.
 *
 * في الحالتين يُرجَع رمز جلسة من هذا الخادم، وهو ما يحمله التطبيق بعد ذلك.
 */

import { json, fail, readJson, configError, prepareDb } from '../../lib/http.js';
import { signSession, fingerprint } from '../../lib/jwt.js';
import { verifyGoogleIdToken } from '../../lib/google.js';

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

/** أقل طول يحفظ للمفتاح عشوائية معتبرة (٢٠ محرفاً من ٣٢ ≈ ١٠٠ بت). */
const MIN_KEY_CHARS = 20;
const MAX_KEY_CHARS = 64;

export const normalizeKey = (raw) => String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

export async function onRequestPost({ request, env }) {
  const bad = configError(env) || await prepareDb(env);
  if (bad) return bad;

  const body = await readJson(request);
  if (body.tooLarge) return fail(413, 'too_large', 'حجم الطلب كبير.');
  if (body.invalid) return fail(400, 'bad_json', 'تعذّر قراءة الطلب.');

  const { provider } = body.value || {};
  let account;

  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID) {
      return fail(503, 'google_not_configured', 'تسجيل الدخول بـ Google غير مُعدّ على الخادم (GOOGLE_CLIENT_ID غائب).');
    }
    let claims;
    try {
      claims = await verifyGoogleIdToken(body.value.idToken, env.GOOGLE_CLIENT_ID);
    } catch (err) {
      return fail(401, 'google_rejected', err.message || 'تعذّر التحقّق من حساب Google.');
    }
    account = {
      id: `google:${claims.sub}`,
      provider: 'google',
      email: claims.email || null,
      name: claims.name || claims.email || 'حساب Google',
      picture: claims.picture || null,
    };
  } else if (provider === 'key') {
    if (!env.KEY_PEPPER) {
      return fail(503, 'key_not_configured', 'الدخول بمفتاح المزامنة غير مُعدّ على الخادم (KEY_PEPPER غائب).');
    }
    const key = normalizeKey(body.value.syncKey);
    if (key.length < MIN_KEY_CHARS || key.length > MAX_KEY_CHARS) {
      return fail(400, 'weak_key', `مفتاح المزامنة يجب أن يكون بين ${MIN_KEY_CHARS} و${MAX_KEY_CHARS} محرفاً.`);
    }
    account = {
      id: `key:${await fingerprint(key, env.KEY_PEPPER)}`,
      provider: 'key',
      email: null,
      name: 'حساب مزامنة',
      picture: null,
    };
  } else {
    return fail(400, 'bad_provider', 'مقدِّم هوية غير معروف.');
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, provider, email, name, picture, rev, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
     ON CONFLICT(id) DO UPDATE SET
       email        = COALESCE(excluded.email, users.email),
       name         = COALESCE(excluded.name, users.name),
       picture      = COALESCE(excluded.picture, users.picture),
       last_seen_at = excluded.last_seen_at`,
  ).bind(account.id, account.provider, account.email, account.name, account.picture, now).run();

  const token = await signSession({ sub: account.id, provider: account.provider }, env.SESSION_SECRET, SESSION_TTL_SECONDS);

  return json({
    token,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
    account: { ...account, id: account.id },
  });
}
