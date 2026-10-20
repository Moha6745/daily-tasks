/**
 * تذكيرات المهام وتنبيهات الأذان.
 *
 * ملاحظة مهمة: متصفحات الويب لا تسمح بجدولة إشعارات تعمل والتطبيق مغلق
 * دون خادم Push. لذلك تُجدول التنبيهات ما دامت الصفحة مفتوحة (ولو في الخلفية)،
 * ويُعاد ضبطها عند كل فتح للتطبيق.
 */

import { getState, update } from './store.js';
import { parseClock, todayKey, formatTime } from './datetime.js';
import { nextPrayer } from './prayer.js';
import { activeCoords } from './location.js';
import { todaysTasks, countOpen } from './tasks.js';

const timers = new Set();
const SENT_KEY = 'tahaddi30:sent';

export function supported() {
  return typeof Notification !== 'undefined';
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported';
}

/** يطلب إذن الإشعارات ويحفظ النتيجة. */
export async function requestPermission() {
  if (!supported()) throw new Error('المتصفح لا يدعم الإشعارات');
  const result = await Notification.requestPermission();
  const granted = result === 'granted';
  update({ settings: { notificationsEnabled: granted } });
  if (granted) schedule();
  return granted;
}

function sentToday() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SENT_KEY) || '{}');
    return raw.day === todayKey() ? new Set(raw.ids) : new Set();
  } catch {
    return new Set();
  }
}

function markSent(id) {
  try {
    const set = sentToday();
    set.add(id);
    sessionStorage.setItem(SENT_KEY, JSON.stringify({ day: todayKey(), ids: [...set] }));
  } catch { /* تجاهل */ }
}

function show(title, body, tag) {
  if (permission() !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      lang: 'ar',
      dir: 'rtl',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* بعض المتصفحات تتطلب Service Worker */ }
}

function clearTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}

/** يضيف مؤقتاً لوقت محدّد اليوم إن لم يكن قد مضى. */
function at(minutesOfDay, id, build) {
  if (minutesOfDay === null) return;
  const now = new Date();
  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  when.setMinutes(minutesOfDay);
  const delay = when - now;
  if (delay <= 0 || delay > 86400000) return;
  if (sentToday().has(id)) return;

  const timer = setTimeout(() => {
    const { title, body } = build();
    show(title, body, id);
    markSent(id);
    timers.delete(timer);
  }, delay);
  timers.add(timer);
}

/** يُعيد جدولة كل تنبيهات اليوم وفق الإعدادات الحالية. */
export function schedule() {
  clearTimers();
  const { settings } = getState();
  if (!settings.notificationsEnabled || permission() !== 'granted') return;

  // 1) تذكير بداية اليوم (الفجر)
  if (settings.fajrReminder) {
    at(parseClock(settings.fajrReminderTime), 'fajr-reminder', () => {
      const open = countOpen(todaysTasks());
      return {
        title: 'صباح النية الصالحة 🌅',
        body: open
          ? `بين يديك ${open} من مهام اليوم. ابدأ بأيسرها وأحبّها إلى الله أدومُها وإن قلّ.`
          : 'ابدأ يومك بتحديد مهامك وعاداتك لهذا اليوم.',
      };
    });
  }

  // 2) تذكير قرب نهاية اليوم (11 ليلاً افتراضياً)
  if (settings.nightReminder) {
    at(parseClock(settings.nightReminderTime), 'night-reminder', () => {
      const daily = todaysTasks();
      const open = countOpen(daily);
      return {
        title: 'حصاد اليوم 🌙',
        body: open
          ? `بقي ${open} من مهام اليوم قبل أن ينتهي. أنجز ما تستطيع ثم اختم بالاستغفار.`
          : 'أتممت كل مهام اليوم. تقبّل الله منك وأعانك على الاستمرار.',
      };
    });
  }

  // 3) تنبيهات مواقيت الصلاة
  if (settings.prayerAlerts) {
    const { lat, lon } = activeCoords();
    const next = nextPrayer({ lat, lon, method: settings.calcMethod, asr: settings.asrMethod });
    for (const [id, when] of Object.entries(next.times || {})) {
      if (!when || id === 'sunrise') continue;
      const lead = Number(settings.prayerAlertLead) || 0;
      const minutes = when.getHours() * 60 + when.getMinutes() - lead;
      at(minutes, `prayer-${id}-${todayKey()}`, () => ({
        title: `اقترب وقت ${prayerName(id)}`,
        body: lead
          ? `${prayerName(id)} بعد ${lead} دقيقة — ${formatTime(when)}`
          : `حان وقت ${prayerName(id)} — ${formatTime(when)}`,
      }));
    }
  }
}

function prayerName(id) {
  return { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' }[id] || id;
}

/** إشعار تجريبي للتأكد من عمل الأذونات. */
export function sendTest() {
  show('تنبيه تجريبي', 'التنبيهات تعمل بنجاح. سنذكّرك عند الفجر وقرب نهاية اليوم.', 'test');
}

export function stop() {
  clearTimers();
}
