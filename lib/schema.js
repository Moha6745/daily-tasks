/**
 * مخطّط قاعدة المزامنة، ومصدره الوحيد.
 *
 * يُطبَّق عند أول استخدام لا بخطوة ترحيل منفصلة. السبب عملي: ربط D1 في
 * إعداد wrangler يحتاج معرّف قاعدة حقيقياً، وأي قيمة بديلة تُفشل النشرة
 * كلها — الموقع الساكن معها. وأدوات الترحيل المحلية تحتاج ذلك الربط أيضاً.
 * فبإنشاء الجداول من الكود يبقى المستودع قابلاً للنشر دون قاعدة، وتعمل
 * التجربة المحلية بقاعدة فارغة، ولا يبقى في المستودع معرّف يصلح فخّاً.
 *
 * العبارات كلها IF NOT EXISTS فتكرارها بلا أثر، وطلبان متوازيان لا يتعارضان.
 */

export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
     id            TEXT PRIMARY KEY,
     provider      TEXT NOT NULL,
     email         TEXT,
     name          TEXT,
     picture       TEXT,
     rev           INTEGER NOT NULL DEFAULT 0,
     created_at    INTEGER NOT NULL,
     last_seen_at  INTEGER NOT NULL
   )`,

  /**
   * بيانات الدخول بكلمة السرّ.
   *
   * لا يُخزَّن البريد ولا الرقم مفتاحاً للبحث، بل بصمتهما بفلفل الخادم،
   * فتسريب القاعدة وحدها لا يعطي قائمة بريد. ويبقى البريد في users للعرض
   * وحده — هو بيان المستخدم عن نفسه لا وسيلة المصادقة.
   *
   * failed_count و locked_until يكفّان التخمين المتسلسل عند نقطة النهاية
   * نفسها، فلا يُعتمد على حدّ خارجي وحده.
   */
  `CREATE TABLE IF NOT EXISTS credentials (
     identifier_hash TEXT PRIMARY KEY,
     account_id      TEXT NOT NULL UNIQUE,
     kind            TEXT NOT NULL,
     server_salt     TEXT NOT NULL,
     verifier        TEXT NOT NULL,
     iterations      INTEGER NOT NULL,
     recovery_hash   TEXT,
     failed_count    INTEGER NOT NULL DEFAULT 0,
     locked_until    INTEGER NOT NULL DEFAULT 0,
     created_at      INTEGER NOT NULL,
     updated_at      INTEGER NOT NULL
   )`,

  /* المحذوفة تبقى شاهدة (deleted=1) كي يصل الحذف إلى بقية الأجهزة
     بدل أن تعيد هي المهمة من جديد في الجولة التالية. */
  `CREATE TABLE IF NOT EXISTS tasks (
     user_id     TEXT NOT NULL,
     id          TEXT NOT NULL,
     rev         INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL,
     deleted     INTEGER NOT NULL DEFAULT 0,
     payload     TEXT,
     PRIMARY KEY (user_id, id)
   )`,

  'CREATE INDEX IF NOT EXISTS tasks_by_rev ON tasks (user_id, rev)',

  /* مستندات مفردة: 'settings' للتفضيلات، 'challenge' للتحدي، 'memorize' لخطة الحفظ */
  `CREATE TABLE IF NOT EXISTS docs (
     user_id     TEXT NOT NULL,
     kind        TEXT NOT NULL,
     rev         INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL,
     payload     TEXT NOT NULL,
     PRIMARY KEY (user_id, kind)
   )`,

  'CREATE INDEX IF NOT EXISTS docs_by_rev ON docs (user_id, rev)',
];

/** يُنفَّذ مرة واحدة لكل عزلة Worker؛ الوعد مخزَّن فلا تتكرّر المحاولة. */
let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = db.batch(STATEMENTS.map((sql) => db.prepare(sql)))
      .catch((err) => { ready = null; throw err; });
  }
  return ready;
}
