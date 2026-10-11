/** فحص سريع لحالة المزامنة — يُستخدم في التشخيص وفي شاشة الإعدادات. */

import { json } from '../../lib/http.js';
import { ensureSchema } from '../../lib/schema.js';

export async function onRequestGet({ env }) {
  const checks = {
    sessionSecret: Boolean(env.SESSION_SECRET),
    keyPepper: Boolean(env.KEY_PEPPER),
    googleClientId: Boolean(env.GOOGLE_CLIENT_ID),
    databaseBound: Boolean(env.DB),
    database: false,
  };

  /* التمييز بين «لا ربط» و«الربط موجود والاستعلام فشل» مقصود: الحالتان
     تظهران بلا تمييز كـ database:false، وعلاجهما مختلف تماماً. */
  let databaseError = null;
  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      await env.DB.prepare('SELECT 1 FROM users LIMIT 1').all();
      checks.database = true;
    } catch (err) {
      databaseError = err.message || String(err);
    }
  } else {
    databaseError = 'قاعدة D1 غير مربوطة بالمشروع (المتغيّر DB غائب).';
  }

  const ready = checks.sessionSecret && checks.database;
  return json({
    ready,
    checks,
    ...(databaseError ? { databaseError } : {}),
    providers: {
      google: checks.googleClientId && checks.database && checks.sessionSecret,
      key: checks.keyPepper && checks.database && checks.sessionSecret,
    },
    serverTime: Date.now(),
  }, ready ? 200 : 503);
}
