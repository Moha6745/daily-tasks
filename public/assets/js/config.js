/**
 * إعدادات تسجيل الدخول.
 *
 * التطبيق يعمل كاملاً دون خادم؛ لتفعيل أزرار Google / Apple ضع المعرّفات هنا:
 *
 *  • googleClientId — من Google Cloud Console → Credentials → OAuth client ID (نوع Web).
 *    أضف نطاق الموقع ضمن "Authorized JavaScript origins".
 *
 *  • appleClientId  — "Services ID" من Apple Developer → Certificates, Identifiers & Profiles.
 *    appleRedirectURI يجب أن يطابق ما سُجّل في لوحة Apple ويعمل عبر HTTPS فقط.
 *
 * ما دامت القيم فارغة تظهر الأزرار معطّلة مع إمكانية "الدخول كضيف"،
 * وتُحفظ كل البيانات محلياً في المتصفح.
 */
export const AUTH_CONFIG = {
  googleClientId: '',
  appleClientId: '',
  appleRedirectURI: '',
};

export const APP_INFO = {
  name: 'تحدي الـ 30',
  version: '1.0.0',
};
