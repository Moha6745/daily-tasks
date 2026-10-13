/**
 * بدء جلسة مزامنة.
 *
 * مقدِّمان للهوية، كلاهما بلا وسيط خارجي:
 *   • password — بريد أو رقم جوال مع كلمة سرّ. التجزئة الثقيلة جرت في
 *                المتصفّح ووصل ناتجها، فلا يرى الخادم كلمة السرّ أصلاً
 *                (انظر lib/password.js).
 *   • key      — مفتاح مزامنة يولّده التطبيق عشوائياً على الجهاز الأول،
 *                فيصلح لمن لا يريد حساباً ولا كلمة سرّ. المفتاح هو كلمة
 *                السرّ نفسها: من يملكه يملك البيانات، ولا يُستعاد إن فُقد.
 *
 * في الحالتين يُرجَع رمز جلسة من هذا الخادم، وهو ما يحمله التطبيق بعد ذلك.
 */

import { json, fail, readJson, configError, prepareDb } from '../../lib/http.js';
import { fingerprint } from '../../lib/jwt.js';
import { normalizeIdentifier, isDerived, DERIVED_CHARS } from '../../lib/password.js';
import { authenticate, sessionResponse, accountFromIdentifier } from '../../lib/accounts.js';

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

  if (provider === 'password') {
    if (!env.KEY_PEPPER) {
      return fail(503, 'password_not_configured', 'الدخول بكلمة السرّ غير مُعدّ على الخادم (KEY_PEPPER غائب).');
    }
    const identifier = normalizeIdentifier(body.value.identifier);
    if (!identifier) return fail(400, 'bad_identifier', 'أدخل بريداً صحيحاً أو رقم جوال بمقدّمة دولته.');
    if (!isDerived(body.value.derived)) return fail(400, 'bad_derived', `ناتج الاشتقاق يجب أن يكون ${DERIVED_CHARS} محرفاً.`);

    const result = await authenticate(env.DB, env, identifier, body.value.derived);
    if (result.error) return fail(result.error.status, result.error.code, result.error.message);

    return json(await sessionResponse(env.DB, env, accountFromIdentifier(result.row.account_id, identifier)));
  }

  if (provider === 'key') {
    if (!env.KEY_PEPPER) {
      return fail(503, 'key_not_configured', 'الدخول بمفتاح المزامنة غير مُعدّ على الخادم (KEY_PEPPER غائب).');
    }
    const key = normalizeKey(body.value.syncKey);
    if (key.length < MIN_KEY_CHARS || key.length > MAX_KEY_CHARS) {
      return fail(400, 'weak_key', `مفتاح المزامنة يجب أن يكون بين ${MIN_KEY_CHARS} و${MAX_KEY_CHARS} محرفاً.`);
    }
    return json(await sessionResponse(env.DB, env, {
      id: `key:${await fingerprint(key, env.KEY_PEPPER)}`,
      provider: 'key',
      email: null,
      name: 'حساب مزامنة',
      picture: null,
    }));
  }

  return fail(400, 'bad_provider', 'مقدِّم هوية غير معروف.');
}
