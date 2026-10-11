/** فحص سريع لحالة المزامنة — يُستخدم في التشخيص وفي شاشة الإعدادات. */

import { json } from '../../lib/http.js';
import { ensureSchema } from '../../lib/schema.js';

export async function onRequestGet({ env }) {
  const checks = {
    sessionSecret: Boolean(env.SESSION_SECRET),
    keyPepper: Boolean(env.KEY_PEPPER),
    googleClientId: Boolean(env.GOOGLE_CLIENT_ID),
    database: false,
  };

  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      await env.DB.prepare('SELECT 1 FROM users LIMIT 1').all();
      checks.database = true;
    } catch {
      checks.database = false;
    }
  }

  const ready = checks.sessionSecret && checks.database;
  return json({
    ready,
    checks,
    providers: {
      google: checks.googleClientId && checks.database && checks.sessionSecret,
      key: checks.keyPepper && checks.database && checks.sessionSecret,
    },
    serverTime: Date.now(),
  }, ready ? 200 : 503);
}
