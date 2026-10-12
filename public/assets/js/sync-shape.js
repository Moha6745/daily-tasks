/**
 * ما يُزامن وما يبقى على الجهاز.
 *
 * القرار المقصود: المحتوى يُزامن، وحالة الجهاز لا تُزامن.
 * إذن الموقع وإذن الإشعارات والإحداثيات تخصّ الجهاز الذي مُنحت عليه؛
 * لو زامنّاها لأطفأ الحاسوب (الذي لا GPS له) موقعَ الجوال، أو لظنّ
 * التطبيق أن الإشعارات مسموحة على جهاز لم يُسأل أصلاً.
 */

/** تفضيلات تتبع المستخدم لا الجهاز. */
export const SYNCED_SETTINGS = [
  'theme',
  'fajrReminder',
  'fajrReminderTime',
  'nightReminder',
  'nightReminderTime',
  'prayerAlerts',
  'prayerAlertLead',
  'calcMethod',
  'asrMethod',
];

/** تبقى محليّة دائماً — موثّقة هنا كي لا تُضاف للمزامنة سهواً. */
export const DEVICE_ONLY_SETTINGS = ['locationEnabled', 'notificationsEnabled', 'coords'];

export function syncedSettings(settings = {}) {
  const out = {};
  for (const key of SYNCED_SETTINGS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

export function challengeDoc(challenge = {}) {
  return { startDate: challenge.startDate ?? null, length: challenge.length ?? 30 };
}

/** خطة الحفظ: حجم الورد والأوجه المحفوظة بتواريخها. */
export function memorizeDoc(memorize = {}) {
  const pages = {};
  for (const [page, at] of Object.entries(memorize.pages || {})) {
    if (typeof at === 'string' && at) pages[page] = at;
  }
  return { pagesPerDay: Number(memorize.pagesPerDay) || 1, pages };
}

/** أقصى عمر لشاهد الحذف قبل تنظيفه. */
export const TRASH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** الطابع الأحدث في الحالة المحلية — به نعرف أن هناك ما يُدفع. */
export function localSignature(state = {}) {
  let max = 0;
  for (const task of state.tasks || []) max = Math.max(max, Number(task.updatedAt) || 0);
  for (const row of state.trash || []) max = Math.max(max, Number(row.updatedAt) || 0);
  max = Math.max(
    max,
    Number(state.stamps?.settings) || 0,
    Number(state.stamps?.challenge) || 0,
    Number(state.stamps?.memorize) || 0,
  );
  return max;
}
