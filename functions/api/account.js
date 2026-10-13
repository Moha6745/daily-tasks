/**
 * إدارة حساب كلمة السرّ: إنشاؤه، واسترجاعه برمز، وتغيير كلمة سرّه.
 *
 * الدخول نفسه في session.js؛ هذا الملف للتغييرات وحدها.
 *
 * رمز الاسترجاع يقوم مقام «أرسلنا رابطاً إلى بريدك»: إرسال البريد يحتاج
 * مزوّداً ونطاقاً مُتحقَّقاً بسجلات DNS، و`pages.dev` ليس نطاقنا فلا نملك
 * سجلاته. فالرمز يُولَّد في الجهاز ويُعرض مرة واحدة ولا يُحفظ منه إلا بصمته،
 * وهو ٢٤ محرفاً ≈ ١١٩ بت فلا يُخمَّن. ومتى رُبط نطاق خاص أُضيف البريد
 * الحقيقي فوق هذا المخطّط بلا هدم (انظر DEPLOY.md §٤.د).
 *
 * الرمز يُستبدل بعد كل استرجاع: المستعمَل مرة قد يكون مرّ بورقة أو محادثة.
 */

import { json, fail, readJson, configError, prepareDb, sessionOf } from '../../lib/http.js';
import {
  normalizeIdentifier, normalizeRecovery, isDerived, identifierHash,
  makeServerSalt, verifierOf, recoveryHashOf, constantTimeEqual,
  DERIVED_CHARS, MIN_RECOVERY_CHARS, MAX_RECOVERY_CHARS,
} from '../../lib/password.js';
import {
  credentialByHash, credentialByAccount, upsertUser, lockError, noteFailure,
  clearFailures, verifyRow, accountFromIdentifier,
} from '../../lib/accounts.js';

const KDF_MIN_ITERATIONS = 100000;
const KDF_MAX_ITERATIONS = 10000000;

/** يتحقّق من مدخلات المعرّف والناتج والرمز، ويعيد ردّ الخطأ إن وُجد. */
function badInput({ identifier, derived, recovery }) {
  if (identifier === null) return fail(400, 'bad_identifier', 'أدخل بريداً صحيحاً أو رقم جوال بمقدّمة دولته.');
  if (derived !== undefined && !isDerived(derived)) {
    return fail(400, 'bad_derived', `ناتج الاشتقاق يجب أن يكون ${DERIVED_CHARS} محرفاً.`);
  }
  if (recovery !== undefined && (recovery.length < MIN_RECOVERY_CHARS || recovery.length > MAX_RECOVERY_CHARS)) {
    return fail(400, 'bad_recovery', `رمز الاسترجاع يجب أن يكون بين ${MIN_RECOVERY_CHARS} و${MAX_RECOVERY_CHARS} محرفاً.`);
  }
  return null;
}

const iterationsOf = (raw) => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return KDF_MIN_ITERATIONS;
  return Math.min(KDF_MAX_ITERATIONS, Math.max(KDF_MIN_ITERATIONS, Math.round(value)));
};

export async function onRequestPost({ request, env }) {
  const bad = configError(env) || await prepareDb(env);
  if (bad) return bad;
  if (!env.KEY_PEPPER) {
    return fail(503, 'password_not_configured', 'حسابات كلمة السرّ غير مُعدّة على الخادم (KEY_PEPPER غائب).');
  }

  const body = await readJson(request);
  if (body.tooLarge) return fail(413, 'too_large', 'حجم الطلب كبير.');
  if (body.invalid) return fail(400, 'bad_json', 'تعذّر قراءة الطلب.');

  const { action } = body.value || {};
  if (action === 'register') return register(env, body.value);
  if (action === 'reset') return reset(env, body.value);
  if (action === 'change') return change(request, env, body.value);
  return fail(400, 'bad_action', 'طلب غير معروف على الحساب.');
}

/* ----------------------------------------------------------------- التسجيل */

async function register(env, input) {
  const identifier = normalizeIdentifier(input.identifier);
  const recovery = normalizeRecovery(input.recovery);
  const invalid = badInput({ identifier, derived: input.derived, recovery });
  if (invalid) return invalid;

  const hash = await identifierHash(identifier, env.KEY_PEPPER);
  const salt = makeServerSalt();
  const now = Date.now();

  const result = await env.DB.prepare(
    `INSERT INTO credentials
       (identifier_hash, account_id, kind, server_salt, verifier, iterations, recovery_hash,
        failed_count, locked_until, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?8)
     ON CONFLICT(identifier_hash) DO NOTHING`,
  ).bind(
    hash,
    `pw:${hash}`,
    identifier.kind,
    salt,
    await verifierOf(salt, input.derived, env.KEY_PEPPER),
    iterationsOf(input.iterations),
    await recoveryHashOf(recovery, env.KEY_PEPPER),
    now,
  ).run();

  if (!result.meta?.changes) {
    return fail(409, 'identifier_taken', 'هذا المعرّف مسجّل. ادخل بكلمة سرّه أو استرجعه برمز الاسترجاع.');
  }

  /* صفّ المستخدم يُنشأ الآن لا عند أول مزامنة، كي لا يبقى حساب بلا مالك
     في القاعدة لو انقطع الاتصال قبل أول جولة. */
  const account = accountFromIdentifier(`pw:${hash}`, identifier);
  await upsertUser(env.DB, account);
  return json({ ok: true, account });
}

/* --------------------------------------------------------------- الاسترجاع */

async function reset(env, input) {
  const identifier = normalizeIdentifier(input.identifier);
  const recovery = normalizeRecovery(input.recovery);
  const nextRecovery = normalizeRecovery(input.nextRecovery);
  const invalid = badInput({ identifier, derived: input.derived, recovery })
    || badInput({ identifier, recovery: nextRecovery });
  if (invalid) return invalid;

  const hash = await identifierHash(identifier, env.KEY_PEPPER);
  const row = await credentialByHash(env.DB, hash);
  if (!row) return fail(401, 'no_account', 'لا حساب بهذا المعرّف.');
  if (!row.recovery_hash) return fail(409, 'no_recovery', 'هذا الحساب بلا رمز استرجاع.');

  const locked = lockError(row);
  if (locked) return fail(locked.status, locked.code, locked.message);

  /* رمز الاسترجاع يخضع لنفس العدّاد: وإلا صار منفذاً للتخمين بلا كفّ. */
  const candidate = await recoveryHashOf(recovery, env.KEY_PEPPER);
  if (!constantTimeEqual(candidate, row.recovery_hash)) {
    const err = await noteFailure(env.DB, hash, row, {
      code: 'bad_recovery_code',
      wrong: 'رمز الاسترجاع لا يطابق هذا الحساب',
    });
    return fail(err.status, err.code, err.message);
  }

  const salt = makeServerSalt();
  await env.DB.prepare(
    `UPDATE credentials SET
       server_salt = ?2, verifier = ?3, iterations = ?4, recovery_hash = ?5,
       failed_count = 0, locked_until = 0, updated_at = ?6
     WHERE identifier_hash = ?1`,
  ).bind(
    hash,
    salt,
    await verifierOf(salt, input.derived, env.KEY_PEPPER),
    iterationsOf(input.iterations),
    await recoveryHashOf(nextRecovery, env.KEY_PEPPER),
    Date.now(),
  ).run();

  return json({ ok: true, account: accountFromIdentifier(row.account_id, identifier) });
}

/* --------------------------------------------------------- تغيير كلمة السرّ */

async function change(request, env, input) {
  const session = await sessionOf(request, env);
  if (!session) return fail(401, 'no_session', 'انتهت الجلسة. أعد الدخول ثم حاول مرة أخرى.');
  if (session.provider !== 'password') return fail(400, 'not_password_account', 'هذا الحساب لا يدخل بكلمة سرّ.');

  const invalid = badInput({ identifier: undefined, derived: input.derived })
    || badInput({ identifier: undefined, derived: input.next });
  if (invalid) return invalid;

  const row = await credentialByAccount(env.DB, session.sub);
  if (!row) return fail(401, 'no_account', 'لم يُعثر على بيانات دخول هذا الحساب.');

  const checked = await verifyRow(env.DB, env, row, row.identifier_hash, input.derived);
  if (checked.error) return fail(checked.error.status, checked.error.code, checked.error.message);

  const salt = makeServerSalt();
  const nextRecovery = normalizeRecovery(input.nextRecovery);
  const rotates = nextRecovery.length >= MIN_RECOVERY_CHARS && nextRecovery.length <= MAX_RECOVERY_CHARS;

  await env.DB.prepare(
    `UPDATE credentials SET
       server_salt = ?2, verifier = ?3, iterations = ?4,
       recovery_hash = COALESCE(?5, recovery_hash), updated_at = ?6
     WHERE identifier_hash = ?1`,
  ).bind(
    row.identifier_hash,
    salt,
    await verifierOf(salt, input.next, env.KEY_PEPPER),
    iterationsOf(input.iterations),
    rotates ? await recoveryHashOf(nextRecovery, env.KEY_PEPPER) : null,
    Date.now(),
  ).run();

  await clearFailures(env.DB, row.identifier_hash);
  return json({ ok: true, recoveryRotated: rotates });
}
