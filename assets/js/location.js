/**
 * تحديد الموقع الجغرافي — يُطلب مرة واحدة عند أول دخول، ويمكن تعديله من الإعدادات.
 */

import { update, getState } from './store.js';

/** مدن جاهزة لمن يرفض مشاركة موقعه. */
export const CITIES = [
  { label: 'الرياض',        lat: 24.7136, lon: 46.6753 },
  { label: 'جدة',           lat: 21.4858, lon: 39.1925 },
  { label: 'مكة المكرمة',   lat: 21.3891, lon: 39.8579 },
  { label: 'المدينة المنورة', lat: 24.5247, lon: 39.5692 },
  { label: 'الدمام',        lat: 26.4207, lon: 50.0888 },
  { label: 'أبها',          lat: 18.2465, lon: 42.5117 },
  { label: 'الكويت',        lat: 29.3759, lon: 47.9774 },
  { label: 'الدوحة',        lat: 25.2854, lon: 51.5310 },
  { label: 'دبي',           lat: 25.2048, lon: 55.2708 },
  { label: 'المنامة',       lat: 26.2285, lon: 50.5860 },
  { label: 'مسقط',          lat: 23.5880, lon: 58.3829 },
  { label: 'عمّان',         lat: 31.9454, lon: 35.9284 },
  { label: 'القاهرة',       lat: 30.0444, lon: 31.2357 },
  { label: 'بغداد',         lat: 33.3152, lon: 44.3661 },
  { label: 'بيروت',         lat: 33.8938, lon: 35.5018 },
  { label: 'الخرطوم',       lat: 15.5007, lon: 32.5599 },
  { label: 'تونس',          lat: 36.8065, lon: 10.1815 },
  { label: 'الجزائر',       lat: 36.7538, lon: 3.0588 },
  { label: 'الرباط',        lat: 34.0209, lon: -6.8416 },
  { label: 'إسطنبول',       lat: 41.0082, lon: 28.9784 },
  { label: 'لندن',          lat: 51.5074, lon: -0.1278 },
  { label: 'باريس',         lat: 48.8566, lon: 2.3522 },
  { label: 'برلين',         lat: 52.5200, lon: 13.4050 },
  { label: 'نيويورك',       lat: 40.7128, lon: -74.0060 },
  { label: 'كوالالمبور',    lat: 3.1390,  lon: 101.6869 },
  { label: 'جاكرتا',        lat: -6.2088, lon: 106.8456 },
];

/** الموقع الافتراضي حين لا يُتاح شيء آخر. */
export const FALLBACK = { ...CITIES[0], source: 'default' };

/** الإحداثيات المعتمدة حالياً (محفوظة، أو الافتراضي). */
export function activeCoords() {
  return getState().settings.coords || FALLBACK;
}

export function setCity(label) {
  const city = CITIES.find((c) => c.label === label);
  if (!city) return null;
  const coords = { ...city, source: 'manual' };
  update({ settings: { coords, locationEnabled: false } });
  return coords;
}

export function setCoords(coords) {
  update({ settings: { coords } });
  return coords;
}

/** هل سبق للمتصفح منح إذن الموقع؟ (قد لا تدعمه كل المتصفحات) */
export async function permissionState() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const res = await navigator.permissions.query({ name: 'geolocation' });
    return res.state; // granted | denied | prompt
  } catch {
    return 'unknown';
  }
}

/**
 * يطلب الموقع من المتصفح ويحفظه.
 * @returns {Promise<{lat:number,lon:number,label:string,source:string}>}
 */
export function requestLocation({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('المتصفح لا يدعم تحديد الموقع'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const coords = {
          lat: Number(latitude.toFixed(4)),
          lon: Number(longitude.toFixed(4)),
          accuracy: Math.round(accuracy || 0),
          label: nearestCity(latitude, longitude),
          source: 'gps',
        };
        update({ settings: { coords, locationEnabled: true } });
        resolve(coords);
      },
      (err) => {
        const messages = {
          1: 'رُفض إذن الموقع. يمكنك اختيار مدينتك يدوياً.',
          2: 'تعذّر تحديد الموقع حالياً. تحقّق من خدمات الموقع.',
          3: 'انتهت مهلة تحديد الموقع.',
        };
        update({ settings: { locationEnabled: false } });
        reject(new Error(messages[err.code] || 'تعذّر تحديد الموقع'));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 300000 },
    );
  });
}

/** أقرب مدينة معروفة — لعرض اسم مفهوم بدل الإحداثيات. */
export function nearestCity(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const c of CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  // أبعد من ~150كم تقريباً: لا ندّعي معرفة المدينة
  return bestDist < 1.8 ? best.label : 'موقعك الحالي';
}
