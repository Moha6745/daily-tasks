/**
 * ما يشترك فيه بدء الجلسة وإدارة الحساب: صفّ المستخدم، ورمز الجلسة،
 * وكفّ التخمين المتسلسل عن كلمة السرّ ورمز الاسترجاع معاً.
 *
 * ملاحظة مقصودة في الرسائل: التطبيق يقول صريحاً «هذا المعرّف مسجّل» عند
 * التسجيل و«بقيت لك ن محاولات» عند الدخول. هذا يكشف وجود الحساب لمن يسأل،
 * وهو ثمن مقبول هنا مقابل رسائل يفهمها صاحب الحساب — فالبديل («تحقّق من
 * بياناتك») يترك من نسي بأيّ معرّف سجّل في حلقة لا مخرج منها. والمحميّ
 * مهامٌ شخصية لا حساب مالي.
 */

import { signSession } from './jwt.js';
import {
  identifierHash, verifierOf, constantTimeEqual, displayName,
  MAX_FAILED, LOCK_MS,
} from './password.js';

export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

/** يسجّل الحساب في users أو يحدّث ما يُعرض منه، ولا يمحو قيمة بقيمة فارغة. */
export async function upsertUser(db, account) {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO users (id, provider, email, name, picture, rev, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
     ON CONFLICT(id) DO UPDATE SET
       email        = COALESCE(excluded.email, users.email),
       name         = COALESCE(excluded.name, users.name),
       picture      = COALESCE(excluded.picture, users.picture),
       last_seen_at = excluded.last_seen_at`,
  ).bind(account.id, account.provider, account.email, account.name, account.picture, now).run();
  return now;
}

/** ردّ بدء الجلسة: رمز موقّع من هذا الخادم مدّته تسعون يوماً. */
export async function sessionResponse(db, env, account) {
  const now = await upsertUser(db, account);
  const token = await signSession({ sub: account.id, provider: account.provider }, env.SESSION_SECRET, SESSION_TTL_SECONDS);
  return { token, expiresAt: now + SESSION_TTL_SECONDS * 1000, account };
}

/* ------------------------------------------------------- صفّ بيانات الدخول */

export const credentialByHash = (db, hash) => db
  .prepare('SELECT * FROM credentials WHERE identifier_hash = ?1')
  .bind(hash)
  .first();

export const credentialByAccount = (db, accountId) => db
  .prepare('SELECT * FROM credentials WHERE account_id = ?1')
  .bind(accountId)
  .first();

/* -------------------------------------------------------------- كفّ التخمين */

/** خطأ القفل إن كان الحساب مقفلاً الآن، أو `null`. */
export function lockError(row) {
  const remaining = Number(row.locked_until) - Date.now();
  if (remaining <= 0) return null;
  return {
    status: 429,
    code: 'locked',
    message: `أُقفل الحساب مؤقّتاً بعد محاولات خاطئة. أعد المحاولة بعد ${Math.ceil(remaining / 60000)} دقيقة.`,
  };
}

/**
 * يسجّل محاولة فاشلة ويعيد الخطأ المعروض.
 *
 * عند بلوغ الحدّ يُقفل الحساب ربع ساعة ويعود العدّاد صفراً، كي تبدأ بعد
 * القفل دفعةُ محاولات جديدة لا محاولةٌ واحدة تقفل ربع ساعة أخرى.
 */
export async function noteFailure(db, hash, row, { code, wrong, hint }) {
  const now = Date.now();
  const failed = Number(row.failed_count) + 1;
  const lock = failed >= MAX_FAILED ? now + LOCK_MS : 0;

  await db.prepare(
    'UPDATE credentials SET failed_count = ?2, locked_until = ?3, updated_at = ?4 WHERE identifier_hash = ?1',
  ).bind(hash, lock ? 0 : failed, lock, now).run();

  return {
    status: 401,
    code,
    message: lock
      ? `${wrong}، وأُقفل الحساب ربع ساعة.${hint ? ` ${hint}` : ''}`
      : `${wrong}. بقيت ${MAX_FAILED - failed} محاولات قبل القفل المؤقّت.`,
  };
}

/** يصفّر العدّادات بعد نجاح. */
export const clearFailures = (db, hash) => db.prepare(
  'UPDATE credentials SET failed_count = 0, locked_until = 0, updated_at = ?2 WHERE identifier_hash = ?1',
).bind(hash, Date.now()).run();

/* ------------------------------------------------------------------ التحقّق */

/**
 * يتحقّق من ناتج الاشتقاق مقابل الصفّ المحفوظ.
 * يعيد `{row, hash}` عند النجاح، أو `{error}` برسالة جاهزة للعرض.
 */
export async function authenticate(db, env, identifier, derived) {
  const hash = await identifierHash(identifier, env.KEY_PEPPER);
  const row = await credentialByHash(db, hash);
  if (!row) {
    return { error: { status: 401, code: 'no_account', message: 'لا حساب بهذا المعرّف. أنشئ حساباً جديداً أولاً.' } };
  }
  return { ...(await verifyRow(db, env, row, hash, derived)), hash };
}

/** نفس التحقّق على صفّ مُحمَّل مسبقاً (تغيير كلمة السرّ من داخل الجلسة). */
export async function verifyRow(db, env, row, hash, derived) {
  const locked = lockError(row);
  if (locked) return { error: locked };

  const candidate = await verifierOf(row.server_salt, derived, env.KEY_PEPPER);
  if (!constantTimeEqual(candidate, row.verifier)) {
    return {
      error: await noteFailure(db, hash, row, {
        code: 'bad_password',
        wrong: 'كلمة السرّ خاطئة',
        hint: 'استعمل رمز الاسترجاع إن نسيتها.',
      }),
    };
  }

  if (Number(row.failed_count) || Number(row.locked_until)) await clearFailures(db, hash);
  return { row };
}

/** الحساب كما يُعاد للتطبيق بعد دخول ناجح. */
export const accountFromIdentifier = (accountId, identifier) => ({
  id: accountId,
  provider: 'password',
  email: identifier.kind === 'email' ? identifier.value : null,
  name: displayName(identifier),
  picture: null,
});
