/**
 * أدوات التاريخ: المفاتيح اليومية، التقويم الهجري، وحدود الأسبوع.
 * الأسبوع يبدأ الأحد وينتهي السبت (التقويم المعتمد في المنطقة العربية).
 */

export const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_AR_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** 'YYYY-MM-DD' بالتوقيت المحلي (وليس UTC كما تفعل toISOString). */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** يحوّل 'YYYY-MM-DD' إلى Date محلي عند منتصف الليل. */
export function fromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayKey() {
  return dateKey(new Date());
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** فرق الأيام الكامل بين مفتاحي تاريخ (b - a). */
export function daysBetween(aKey, bKey) {
  const a = fromKey(aKey);
  const b = fromKey(bKey);
  return Math.round((b - a) / 86400000);
}

/** السبت الأخير من أسبوع التاريخ المعطى (الأسبوع يبدأ الأحد). */
export function endOfWeek(d = new Date()) {
  const base = startOfDay(d);
  return addDays(base, 6 - base.getDay()); // getDay(): 0=الأحد … 6=السبت
}

export function endOfWeekKey(d = new Date()) {
  return dateKey(endOfWeek(d));
}

/** أول يوم في شهر التاريخ المعطى. */
export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** يزيح الشهر n شهراً (سالباً أو موجباً) ويعيد أوّله. */
export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** أيام الشهر كاملة من الأول إلى آخره. */
export function monthDays(d = new Date()) {
  const first = startOfMonth(d);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
}

/** 'أكتوبر 2026' */
export function monthLabel(d = new Date()) {
  return `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/** أيام الأسبوع الحالي كاملة من الأحد إلى السبت. */
export function currentWeekDays(d = new Date()) {
  const base = startOfDay(d);
  const sunday = addDays(base, -base.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/* ------------------------------------------------------------ الصياغة */

const hijriFmt = (() => {
  try {
    const f = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    f.format(new Date()); // تحقق مبكر من الدعم
    return f;
  } catch {
    return null;
  }
})();

/** '14 رمضان 1446 هـ' — فارغة إن لم يدعم المتصفح التقويم الهجري. */
export function hijriDate(d = new Date()) {
  if (!hijriFmt) return '';
  try {
    return hijriFmt.format(d).replace(/\s*هـ?\s*$/, '') + ' هـ';
  } catch {
    return '';
  }
}

/** '25 مارس 2025' */
export function gregorianDate(d = new Date()) {
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/** '25 مارس' */
export function shortDate(d) {
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}

export function weekdayName(d) {
  return WEEKDAYS_AR[d.getDay()];
}

/** 'الخميس، 26 مارس' — التسمية المعروضة بجانب المهمة. */
export function taskDateLabel(key) {
  const d = fromKey(key);
  const today = startOfDay(new Date());
  const diff = daysBetween(dateKey(today), key);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === -1) return 'أمس';
  return `${weekdayName(d)}، ${shortDate(d)}`;
}

/** '3:32 م' من عدد ساعات عشرية أو كائن Date. */
export function formatTime(value) {
  const d = value instanceof Date ? value : hoursToDate(value);
  if (!d || Number.isNaN(d.getTime())) return '--:--';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

/** يحوّل ساعات عشرية (مثل 15.533) إلى Date اليوم. */
export function hoursToDate(hours, base = new Date()) {
  if (!Number.isFinite(hours)) return null;
  const d = startOfDay(base);
  d.setMinutes(Math.round(hours * 60));
  return d;
}

/** '1 س و 24 د' من عدد الدقائق. */
export function formatRemaining(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س و ${m} د`;
}

/** 'HH:MM' → عدد الدقائق منذ منتصف الليل. */
export function parseClock(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
