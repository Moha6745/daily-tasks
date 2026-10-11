/** أدوات مشتركة لنقاط النهاية: ردود JSON، قراءة الجسم بحدّ أقصى، والتحقّق من الجلسة. */

import { verifySession } from './jwt.js';
import { ensureSchema } from './schema.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

/** خطأ بصيغة موحّدة: code للتطبيق كي يتصرّف، message للعرض على المستخدم. */
export const fail = (status, code, message) => json({ error: { code, message } }, status);

export const MAX_BODY_BYTES = 1_048_576; // ميغابايت واحد

/** يقرأ جسم الطلب كـ JSON برفض ما تجاوز الحدّ قبل تحليله. */
export async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { tooLarge: true };
  try {
    return { value: JSON.parse(text || '{}') };
  } catch {
    return { invalid: true };
  }
}

/**
 * يتحقّق من إعداد الخادم. الرسالة صريحة لأن أكثر أسباب تعطّل المزامنة
 * هو ربط ناقص بعد النشر، لا خطأ في الكود.
 */
export function configError(env, { needsDb = true } = {}) {
  if (!env.SESSION_SECRET) return fail(503, 'not_configured', 'المزامنة غير مُعدّة على الخادم: متغيّر SESSION_SECRET غائب.');
  if (needsDb && !env.DB) return fail(503, 'not_configured', 'المزامنة غير مُعدّة على الخادم: قاعدة D1 غير مربوطة بالمشروع.');
  return null;
}

/**
 * يهيّئ القاعدة قبل الاستخدام ويحوّل تعذّر الوصول إليها إلى خطأ مفهوم.
 * الربط قد يكون موجوداً وقاعدته محذوفة أو معرّفها خاطئاً، فلا يكفي
 * التحقّق من وجود env.DB وحده.
 */
export async function prepareDb(env) {
  try {
    await ensureSchema(env.DB);
    return null;
  } catch (err) {
    return fail(503, 'db_unreachable', `تعذّر الوصول إلى قاعدة المزامنة: ${err.message}`);
  }
}

/** يعيد حمولة الجلسة من ترويسة Authorization، أو null. */
export async function sessionOf(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  return verifySession(token, env.SESSION_SECRET);
}
