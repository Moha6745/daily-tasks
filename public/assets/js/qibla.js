/** اتجاه القبلة والمسافة إلى الكعبة المشرّفة. */

export const KAABA = { lat: 21.4224779, lon: 39.8251832 };
const DEG = Math.PI / 180;

/** الاتجاه بالدرجات من الشمال الحقيقي باتجاه عقارب الساعة (0–360). */
export function qiblaBearing(lat, lon) {
  const φ1 = lat * DEG;
  const φ2 = KAABA.lat * DEG;
  const Δλ = (KAABA.lon - lon) * DEG;
  const y = Math.sin(Δλ);
  const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** المسافة بخط مستقيم على سطح الأرض بالكيلومترات. */
export function distanceToKaaba(lat, lon) {
  const R = 6371;
  const dφ = (KAABA.lat - lat) * DEG;
  const dλ = (KAABA.lon - lon) * DEG;
  const a = Math.sin(dφ / 2) ** 2
    + Math.cos(lat * DEG) * Math.cos(KAABA.lat * DEG) * Math.sin(dλ / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const COMPASS_POINTS = [
  'شمال', 'شمال شرق', 'شرق', 'جنوب شرق',
  'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب',
];

/** اسم الجهة العربية لزاوية معطاة. */
export function bearingName(deg) {
  return COMPASS_POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/**
 * يراقب بوصلة الجهاز. يُعيد دالة إيقاف، أو null إن لم تتوفر الحساسات.
 * @param {(heading:number)=>void} onHeading
 */
export function watchHeading(onHeading) {
  if (typeof window.DeviceOrientationEvent === 'undefined') return null;

  const handler = (e) => {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading;          // iOS: الشمال المغناطيسي مباشرة
    } else if (typeof e.alpha === 'number') {
      heading = e.absolute === false ? null : 360 - e.alpha;
    }
    if (heading !== null && Number.isFinite(heading)) onHeading((heading + 360) % 360);
  };

  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, handler, true);
  return () => window.removeEventListener(evt, handler, true);
}

/** يطلب إذن البوصلة على iOS 13+. */
export async function requestCompassPermission() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return typeof DOE !== 'undefined';
}
