/**
 * مزامنة في جولة واحدة: دفع كامل، وسحب تفاضلي.
 *
 * التطبيق يرسل حالته المحلية كلها في كل مرة (مهام وشواهد حذف ومستندات).
 * المهام في تطبيق شخصي عشرات لا آلاف، فثمن الإرسال الكامل زهيد، ومقابله
 * اختفاء صنف كامل من العلل: تغيير لم يُرسل لأن حسابات «ما تغيّر» أخطأت.
 *
 * حسم التعارض: الأحدث يفوز، بحسب updated_at القادم من ساعة العميل.
 * أما مؤشّر السحب فعدّاد الخادم (rev)، لا الساعات، فاختلاف ساعة جهاز
 * لا يُسقط سجلاً من السحب.
 */

import { json, fail, readJson, configError, sessionOf, prepareDb } from '../../lib/http.js';

const MAX_TASKS = 2000;
const MAX_TASK_PAYLOAD = 8192;
// خطة الحفظ قد تحمل ٦٠٤ وجه بتواريخها، فالحدّ أوسع من بقية المستندات
const MAX_DOC_PAYLOAD = 32768;
const DOC_KINDS = new Set(['settings', 'challenge', 'memorize']);
const BATCH_SIZE = 100;

const isStamp = (v) => Number.isFinite(v) && v > 0 && v < 4_102_444_800_000; // حتى سنة ٢١٠٠

const TASK_UPSERT = `
  INSERT INTO tasks (user_id, id, rev, updated_at, deleted, payload)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(user_id, id) DO UPDATE SET
    rev = excluded.rev, updated_at = excluded.updated_at,
    deleted = excluded.deleted, payload = excluded.payload
  WHERE excluded.updated_at > tasks.updated_at`;

const DOC_UPSERT = `
  INSERT INTO docs (user_id, kind, rev, updated_at, payload)
  VALUES (?1, ?2, ?3, ?4, ?5)
  ON CONFLICT(user_id, kind) DO UPDATE SET
    rev = excluded.rev, updated_at = excluded.updated_at, payload = excluded.payload
  WHERE excluded.updated_at > docs.updated_at`;

export async function onRequestPost({ request, env }) {
  const bad = configError(env) || await prepareDb(env);
  if (bad) return bad;

  const session = await sessionOf(request, env);
  if (!session) return fail(401, 'no_session', 'انتهت الجلسة. أعد تسجيل الدخول.');

  const body = await readJson(request);
  if (body.tooLarge) return fail(413, 'too_large', 'حجم بيانات المزامنة كبير.');
  if (body.invalid) return fail(400, 'bad_json', 'تعذّر قراءة بيانات المزامنة.');

  const userId = session.sub;
  const payload = body.value || {};
  const since = Number.isInteger(payload.since) && payload.since >= 0 ? payload.since : 0;
  const incomingTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const incomingDocs = payload.docs && typeof payload.docs === 'object' ? payload.docs : {};

  if (incomingTasks.length > MAX_TASKS) {
    return fail(413, 'too_many_tasks', `الحدّ الأقصى ${MAX_TASKS} مهمة.`);
  }

  /* ترتيب السجلات الواردة بعد تنقيحها، مع رفض ما لا يصلح للتخزين */
  const clean = [];
  for (const row of incomingTasks) {
    const id = String(row?.id || '');
    if (!id || id.length > 64 || !isStamp(row?.updatedAt)) continue;
    const deleted = row.deleted ? 1 : 0;
    let text = null;
    if (!deleted) {
      if (!row.payload || typeof row.payload !== 'object') continue;
      text = JSON.stringify(row.payload);
      if (text.length > MAX_TASK_PAYLOAD) continue;
    }
    clean.push({ id, updatedAt: Math.floor(row.updatedAt), deleted, text });
  }

  const cleanDocs = [];
  for (const [kind, doc] of Object.entries(incomingDocs)) {
    if (!DOC_KINDS.has(kind) || !isStamp(doc?.updatedAt)) continue;
    if (!doc.payload || typeof doc.payload !== 'object') continue;
    const text = JSON.stringify(doc.payload);
    if (text.length > MAX_DOC_PAYLOAD) continue;
    cleanDocs.push({ kind, updatedAt: Math.floor(doc.updatedAt), text });
  }

  /* ما هو أحدث فعلاً من المخزَّن؟ نقرأ الطوابع أولاً كي لا نحرق رقم دفعة
     على مزامنة لا تغيّر شيئاً — وهي الغالبة. */
  const [haveTasks, haveDocs] = await Promise.all([
    env.DB.prepare('SELECT id, updated_at FROM tasks WHERE user_id = ?1').bind(userId).all(),
    env.DB.prepare('SELECT kind, updated_at FROM docs WHERE user_id = ?1').bind(userId).all(),
  ]);

  const taskStamps = new Map((haveTasks.results || []).map((r) => [r.id, Number(r.updated_at)]));
  const docStamps = new Map((haveDocs.results || []).map((r) => [r.kind, Number(r.updated_at)]));

  const taskWrites = clean.filter((t) => !(taskStamps.get(t.id) >= t.updatedAt));
  const docWrites = cleanDocs.filter((d) => !(docStamps.get(d.kind) >= d.updatedAt));

  let rev;
  if (taskWrites.length || docWrites.length) {
    const bumped = await env.DB
      .prepare('UPDATE users SET rev = rev + 1, last_seen_at = ?2 WHERE id = ?1 RETURNING rev')
      .bind(userId, Date.now())
      .first();
    if (!bumped) return fail(401, 'no_account', 'الحساب غير موجود. أعد تسجيل الدخول.');
    rev = Number(bumped.rev);

    const statements = [
      ...taskWrites.map((t) => env.DB.prepare(TASK_UPSERT).bind(userId, t.id, rev, t.updatedAt, t.deleted, t.text)),
      ...docWrites.map((d) => env.DB.prepare(DOC_UPSERT).bind(userId, d.kind, rev, d.updatedAt, d.text)),
    ];
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
    }
  } else {
    const row = await env.DB.prepare('SELECT rev FROM users WHERE id = ?1').bind(userId).first();
    if (!row) return fail(401, 'no_account', 'الحساب غير موجود. أعد تسجيل الدخول.');
    rev = Number(row.rev);
  }

  /* السحب: كل ما كُتب بعد مؤشّر العميل */
  const [pullTasks, pullDocs] = await Promise.all([
    env.DB.prepare('SELECT id, updated_at, deleted, payload FROM tasks WHERE user_id = ?1 AND rev > ?2').bind(userId, since).all(),
    env.DB.prepare('SELECT kind, updated_at, payload FROM docs WHERE user_id = ?1 AND rev > ?2').bind(userId, since).all(),
  ]);

  const docsOut = {};
  for (const row of pullDocs.results || []) {
    docsOut[row.kind] = { updatedAt: Number(row.updated_at), payload: JSON.parse(row.payload) };
  }

  return json({
    rev,
    serverTime: Date.now(),
    applied: taskWrites.length + docWrites.length,
    tasks: (pullTasks.results || []).map((row) => ({
      id: row.id,
      updatedAt: Number(row.updated_at),
      deleted: Boolean(row.deleted),
      payload: row.payload ? JSON.parse(row.payload) : null,
    })),
    docs: docsOut,
  });
}
