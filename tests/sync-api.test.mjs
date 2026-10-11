/**
 * اختبارات بروتوكول المزامنة مقابل خادم تطوير حقيقي (Pages Functions + D1 محلية).
 *
 * التشغيل:
 *   npm run dev                 # في طرفية
 *   npm run test:sync           # في أخرى
 *
 * تحاكي الاختبارات جهازين على حساب واحد، فتثبت ما يصعب رؤيته بالتجربة اليدوية:
 * انتقال الحذف، وحسم التعارض لصالح الأحدث، وعدم تحرّك المؤشّر بلا تغيير.
 */

import assert from 'node:assert/strict';

const BASE = process.env.SYNC_BASE || 'http://127.0.0.1:8788';

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

const api = async (path, { method = 'POST', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** مفتاح فريد لكل تشغيل كي لا تتشابك الاختبارات مع بيانات سابقة. */
const freshKey = () => `TEST${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const task = (id, title, updatedAt) => ({
  id,
  updatedAt,
  deleted: false,
  payload: { id, title, date: '2026-10-11', repeatDaily: false, category: 'work', done: false, completions: {}, createdAt: '2026-10-11T00:00:00.000Z', updatedAt },
});

console.log(`\nاختبارات المزامنة على ${BASE}\n`);

/** حالة الخادم تُقرأ مرة واحدة: بعض التوقّعات تتبع ما هو مُعدّ فعلاً. */
let health = {};
try {
  health = (await api('/api/health', { method: 'GET' })).body || {};
} catch (err) {
  console.log(`\n✗ تعذّر الوصول إلى ${BASE} — ${err.message}`);
  console.log('  شغّل الخادم أولاً: npm run dev   (أو مرّر SYNC_BASE لعنوان آخر)\n');
  process.exit(1);
}

await test('الخادم جاهز: قاعدة مربوطة وأسرار مضبوطة', async () => {
  const { status, body } = await api('/api/health', { method: 'GET' });
  assert.equal(status, 200, `الحالة ${status} — هل الخادم يعمل؟`);
  assert.equal(body.ready, true, `الخادم غير جاهز: ${body.databaseError || JSON.stringify(body.checks)}`);
  assert.equal(body.checks.databaseBound, true, 'قاعدة D1 غير مربوطة بالمشروع');
  assert.equal(body.checks.database, true, body.databaseError || 'القاعدة مربوطة لكن الاستعلام فشل');
  assert.equal(body.providers.key, true);
});

await test('الجلسة: مفتاح ضعيف يُرفض', async () => {
  const { status, body } = await api('/api/session', { body: { provider: 'key', syncKey: 'SHORT' } });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'weak_key');
});

await test('الجلسة: مقدِّم مجهول يُرفض', async () => {
  const { status } = await api('/api/session', { body: { provider: 'nope' } });
  assert.equal(status, 400);
});

await test('الجلسة: رمز Google ملفّق لا يفتح حساباً', async () => {
  const fake = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'x' })).toString('base64url')}.${Buffer.from(
    JSON.stringify({ sub: '1', aud: '123456789-localdevtest.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString('base64url')}.ZmFrZQ`;
  const { status, body } = await api('/api/session', { body: { provider: 'google', idToken: fake } });

  /* نشرة لم يُضبط فيها GOOGLE_CLIENT_ID ترفض قبل التحقّق من التوقيع، وهو
     رفض صحيح لكنه لسبب آخر. المهم في الحالتين: لا جلسة ولا رمز. */
  if (health.providers?.google) {
    assert.equal(status, 401, 'الرمز الملفّق لم يُرفض بالتحقّق من التوقيع');
    assert.equal(body.error.code, 'google_rejected');
  } else {
    assert.equal(status, 503);
    assert.equal(body.error.code, 'google_not_configured');
  }
  assert.ok(!body.token, 'أُصدر رمز جلسة لرمز Google ملفّق');
});

await test('المزامنة بلا رمز جلسة تُرفض', async () => {
  const { status, body } = await api('/api/sync', { body: { since: 0 } });
  assert.equal(status, 401);
  assert.equal(body.error.code, 'no_session');
});

await test('المزامنة برمز مُعدَّل تُرفض (التوقيع يحمي الحساب)', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const [h, p, sig] = s.token.split('.');
  const forged = JSON.parse(Buffer.from(p, 'base64url').toString());
  forged.sub = 'key:somebodyelse';
  const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
  const { status } = await api('/api/sync', { token: tampered, body: { since: 0 } });
  assert.equal(status, 401);
});

await test('الجهاز الأول: يدفع مهامه ويستعيد مؤشّراً', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  assert.ok(s.token, 'لم يُصدر رمز جلسة');
  assert.equal(s.account.provider, 'key');

  const now = Date.now();
  const { status, body } = await api('/api/sync', {
    token: s.token,
    body: {
      since: 0,
      tasks: [task('t_a', 'قراءة ورد الصباح', now), task('t_b', 'تمرين', now)],
      docs: { challenge: { updatedAt: now, payload: { startDate: '2026-10-01', length: 30 } } },
    },
  });
  assert.equal(status, 200);
  assert.equal(body.applied, 3);
  assert.equal(body.rev, 1);
  assert.equal(body.tasks.length, 2);
});

await test('الجهاز الثاني: يسحب كل شيء بمؤشّر صفر', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const now = Date.now();
  await api('/api/sync', { token: s.token, body: { since: 0, tasks: [task('t_a', 'مهمة أولى', now)], docs: {} } });

  // نفس المفتاح من "جهاز" آخر: جلسة جديدة، ذاكرة محلية فارغة
  const { body: s2 } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  assert.equal(s2.account.id, s.account.id, 'المفتاح نفسه يجب أن يعطي الحساب نفسه');
  const { body: pulled } = await api('/api/sync', { token: s2.token, body: { since: 0, tasks: [], docs: {} } });
  assert.equal(pulled.tasks.length, 1);
  assert.equal(pulled.tasks[0].payload.title, 'مهمة أولى');
});

await test('مفتاح مختلف = حساب مختلف: لا تتسرّب البيانات بين الحسابات', async () => {
  const a = freshKey();
  const b = freshKey();
  const { body: sa } = await api('/api/session', { body: { provider: 'key', syncKey: a } });
  const { body: sb } = await api('/api/session', { body: { provider: 'key', syncKey: b } });
  assert.notEqual(sa.account.id, sb.account.id);
  await api('/api/sync', { token: sa.token, body: { since: 0, tasks: [task('t_secret', 'سرّي', Date.now())], docs: {} } });
  const { body: pulled } = await api('/api/sync', { token: sb.token, body: { since: 0, tasks: [], docs: {} } });
  assert.equal(pulled.tasks.length, 0);
});

await test('المفتاح يُطبَّع: الشُّرَط والأحرف الصغيرة تعطي الحساب نفسه', async () => {
  const key = freshKey();
  const { body: s1 } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const decorated = key.toLowerCase().replace(/(.{4})/g, '$1-');
  const { body: s2 } = await api('/api/session', { body: { provider: 'key', syncKey: decorated } });
  assert.equal(s1.account.id, s2.account.id);
});

await test('التعارض: الأحدث يفوز، والأقدم لا يطمس الجديد', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const t0 = Date.now();

  await api('/api/sync', { token: s.token, body: { since: 0, tasks: [task('t_x', 'الأصل', t0)], docs: {} } });

  // جهاز متأخّر يرسل نسخة أقدم: تُرفض
  const { body: stale } = await api('/api/sync', { token: s.token, body: { since: 0, tasks: [task('t_x', 'نسخة قديمة', t0 - 60000)], docs: {} } });
  assert.equal(stale.applied, 0, 'النسخة الأقدم لا يجوز أن تُكتب');
  assert.equal(stale.tasks.find((t) => t.id === 't_x').payload.title, 'الأصل');

  // تعديل أحدث: يفوز
  const { body: fresh } = await api('/api/sync', { token: s.token, body: { since: 0, tasks: [task('t_x', 'تعديل أحدث', t0 + 60000)], docs: {} } });
  assert.equal(fresh.applied, 1);
  assert.equal(fresh.tasks.find((t) => t.id === 't_x').payload.title, 'تعديل أحدث');
});

await test('الحذف ينتقل: الشاهد يصل للجهاز الآخر بدل أن يعيد المهمة', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const t0 = Date.now();
  await api('/api/sync', { token: s.token, body: { since: 0, tasks: [task('t_del', 'للحذف', t0)], docs: {} } });

  const { body: afterDelete } = await api('/api/sync', {
    token: s.token,
    body: { since: 0, tasks: [{ id: 't_del', updatedAt: t0 + 1000, deleted: true }], docs: {} },
  });
  assert.equal(afterDelete.applied, 1);
  const row = afterDelete.tasks.find((t) => t.id === 't_del');
  assert.equal(row.deleted, true);
  assert.equal(row.payload, null);
});

await test('المؤشّر لا يتحرّك بلا تغيير، والسحب التفاضلي لا يعيد ما لم يتغيّر', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const now = Date.now();
  const payload = { since: 0, tasks: [task('t_same', 'ثابتة', now)], docs: {} };

  const { body: first } = await api('/api/sync', { token: s.token, body: payload });
  assert.equal(first.applied, 1);

  const { body: again } = await api('/api/sync', { token: s.token, body: { ...payload, since: first.rev } });
  assert.equal(again.applied, 0, 'إعادة إرسال نفس الحالة لا يجوز أن تُحسب كتابة');
  assert.equal(again.rev, first.rev, 'المؤشّر تحرّك بلا تغيير');
  assert.equal(again.tasks.length, 0, 'السحب التفاضلي أعاد سجلاً لم يتغيّر');
});

await test('الإعدادات تُزامن كمستند مفرد', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const now = Date.now();
  await api('/api/sync', {
    token: s.token,
    body: { since: 0, tasks: [], docs: { settings: { updatedAt: now, payload: { theme: 'dark', calcMethod: 'umm_al_qura' } } } },
  });
  const { body } = await api('/api/sync', { token: s.token, body: { since: 0, tasks: [], docs: {} } });
  assert.equal(body.docs.settings.payload.theme, 'dark');
});

await test('الحدود: حمولة مهمة ضخمة تُهمل بلا إسقاط الطلب كله', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const now = Date.now();
  const huge = task('t_huge', 'x'.repeat(9000), now);
  const { status, body } = await api('/api/sync', { token: s.token, body: { since: 0, tasks: [huge, task('t_ok', 'سليمة', now)], docs: {} } });
  assert.equal(status, 200);
  assert.equal(body.applied, 1, 'كان يجب قبول السليمة وإهمال الضخمة');
  assert.ok(!body.tasks.some((t) => t.id === 't_huge'));
});

await test('الحدود: طابع زمني غير صالح يُهمل', async () => {
  const key = freshKey();
  const { body: s } = await api('/api/session', { body: { provider: 'key', syncKey: key } });
  const { body } = await api('/api/sync', {
    token: s.token,
    body: { since: 0, tasks: [{ id: 't_bad', updatedAt: 'ليس رقماً', deleted: false, payload: { title: 'x' } }], docs: {} },
  });
  assert.equal(body.applied, 0);
});

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} ناجح، ${failures.length} فاشل\n`);
process.exit(failures.length ? 1 : 0);
