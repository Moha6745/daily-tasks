/**
 * حساب مواقيت الصلاة محلياً من إحداثيات الموقع — دون أي اتصال بالشبكة.
 * الخوارزمية الفلكية القياسية (موقع الشمس + زوايا الشفق).
 */

const DEG = Math.PI / 180;
const sin = (d) => Math.sin(d * DEG);
const cos = (d) => Math.cos(d * DEG);
const tan = (d) => Math.tan(d * DEG);
const asin = (x) => Math.asin(x) / DEG;
const acos = (x) => Math.acos(x) / DEG;
const atan2 = (y, x) => Math.atan2(y, x) / DEG;
const acot = (x) => Math.atan(1 / x) / DEG;

const fix = (a, range) => {
  const r = a - range * Math.floor(a / range);
  return r < 0 ? r + range : r;
};
const fixAngle = (a) => fix(a, 360);
const fixHour = (a) => fix(a, 24);

/** طرق الحساب المعتمدة. isha كرقم = زاوية بالدرجات؛ كـ {minutes} = دقائق بعد المغرب. */
export const METHODS = {
  umm_al_qura: { name: 'أم القرى (مكة المكرمة)', fajr: 18.5, isha: { minutes: 90 } },
  mwl:         { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  egypt:       { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  karachi:     { name: 'جامعة العلوم الإسلامية — كراتشي', fajr: 18, isha: 18 },
  isna:        { name: 'ISNA — أمريكا الشمالية', fajr: 15, isha: 15 },
  dubai:       { name: 'هيئة الأوقاف — دبي', fajr: 18.2, isha: 18.2 },
};

export const ASR_METHODS = {
  standard: { name: 'الجمهور (شافعي، مالكي، حنبلي)', factor: 1 },
  hanafi:   { name: 'الحنفي', factor: 2 },
};

export const PRAYER_META = [
  { id: 'fajr',    name: 'الفجر',   desc: 'مطلع الصلاة',       icon: 'wb_twilight' },
  { id: 'sunrise', name: 'الشروق',  desc: 'انتهاء وقت الفجر',  icon: 'light_mode', isPrayer: false },
  { id: 'dhuhr',   name: 'الظهر',   desc: 'مطلع الصلاة',       icon: 'clear_day' },
  { id: 'asr',     name: 'العصر',   desc: 'مطلع الصلاة',       icon: 'wb_sunny' },
  { id: 'maghrib', name: 'المغرب',  desc: 'موعد الإفطار',      icon: 'nights_stay' },
  { id: 'isha',    name: 'العشاء',  desc: 'ختم اليوم',         icon: 'dark_mode' },
];

/** عدد الأيام اليوليانية لتاريخ ميلادي. */
function julianDate(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/** ميل الشمس ومعادلة الزمن ليوم يولياني. */
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);          // الشذوذ المتوسط
  const q = fixAngle(280.459 + 0.98564736 * D);          // خط الطول المتوسط
  const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g)); // خط الطول الظاهري
  const e = 23.439 - 0.00000036 * D;                      // ميل فلك البروج
  const declination = asin(sin(e) * sin(L));
  const RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
  const equationOfTime = q / 15 - RA;
  return { declination, equationOfTime };
}

/** الزمن (بالساعات) بين الظهر الشمسي وبلوغ الشمس الارتفاع -angle. */
function hourAngle(angle, latitude, declination) {
  const t = (-sin(angle) - sin(declination) * sin(latitude)) / (cos(declination) * cos(latitude));
  if (t > 1 || t < -1) return null; // الظاهرة لا تحدث في هذا اليوم (خطوط عرض عالية)
  return acos(t) / 15;
}

/** زاوية الساعة للعصر حسب معامل الظل. */
function asrHourAngle(factor, latitude, declination) {
  const angle = -acot(factor + tan(Math.abs(latitude - declination)));
  return hourAngle(angle, latitude, declination);
}

/**
 * يحسب مواقيت يوم واحد.
 * @returns {{[k:string]: Date|null}} كائنات Date بالتوقيت المحلي للجهاز.
 */
export function prayerTimes({ lat, lon, date = new Date(), method = 'umm_al_qura', asr = 'standard' }) {
  const conf = METHODS[method] || METHODS.umm_al_qura;
  const asrConf = ASR_METHODS[asr] || ASR_METHODS.standard;

  const jd = julianDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  // إزاحة المنطقة الزمنية للجهاز بالساعات (موجبة شرق غرينتش)
  const tz = -date.getTimezoneOffset() / 60;
  const { declination, equationOfTime } = sunPosition(jd + (12 - tz) / 24 - lon / 360);

  const dhuhr = 12 + tz - lon / 15 - equationOfTime;
  const refraction = 0.833; // انكسار ضوئي + نصف قطر القرص الشمسي

  const sunriseHA = hourAngle(refraction, lat, declination);
  const fajrHA = hourAngle(conf.fajr, lat, declination);
  const asrHA = asrHourAngle(asrConf.factor, lat, declination);

  const times = {
    fajr: fajrHA === null ? null : dhuhr - fajrHA,
    sunrise: sunriseHA === null ? null : dhuhr - sunriseHA,
    dhuhr: dhuhr + 1 / 60, // دقيقة احتياط بعد الزوال
    asr: asrHA === null ? null : dhuhr + asrHA,
    maghrib: sunriseHA === null ? null : dhuhr + sunriseHA,
    isha: null,
  };

  if (typeof conf.isha === 'object') {
    times.isha = times.maghrib === null ? null : times.maghrib + conf.isha.minutes / 60;
  } else {
    const ishaHA = hourAngle(conf.isha, lat, declination);
    times.isha = ishaHA === null ? null : dhuhr + ishaHA;
  }

  // تقدير احتياطي لخطوط العرض العالية: سُبع الليل
  if (times.fajr === null || times.isha === null) {
    const night = times.sunrise !== null && times.maghrib !== null
      ? fixHour(times.sunrise + 24 - times.maghrib)
      : 10;
    if (times.fajr === null && times.sunrise !== null) times.fajr = times.sunrise - night / 7;
    if (times.isha === null && times.maghrib !== null) times.isha = times.maghrib + night / 7;
  }

  const out = {};
  for (const [key, hours] of Object.entries(times)) {
    if (hours === null || !Number.isFinite(hours)) { out[key] = null; continue; }
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setMinutes(Math.round(fixHour(hours) * 60));
    out[key] = d;
  }
  return out;
}

/**
 * الصلاة القادمة مع ما تبقّى عليها.
 * يبحث في يوم الغد أيضاً حتى لا ينقطع العدّاد بعد العشاء.
 */
export function nextPrayer(opts) {
  const now = opts.now || new Date();
  const todayTimes = prayerTimes({ ...opts, date: now });
  const order = PRAYER_META.filter((p) => p.isPrayer !== false).map((p) => p.id);

  let previous = null;
  for (const id of order) {
    const at = todayTimes[id];
    if (!at) continue;
    if (at > now) {
      return {
        id,
        meta: PRAYER_META.find((p) => p.id === id),
        at,
        previous,
        minutesLeft: (at - now) / 60000,
        times: todayTimes,
      };
    }
    previous = { id, at };
  }

  // كل صلوات اليوم مضت → فجر الغد
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowTimes = prayerTimes({ ...opts, date: tomorrow });
  const at = tomorrowTimes.fajr;
  return {
    id: 'fajr',
    meta: PRAYER_META.find((p) => p.id === 'fajr'),
    at,
    previous,
    minutesLeft: at ? (at - now) / 60000 : 0,
    times: todayTimes,
    tomorrow: true,
  };
}
