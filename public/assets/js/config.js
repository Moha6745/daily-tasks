/**
 * إعدادات تسجيل الدخول.
 *
 * التطبيق يعمل كاملاً دون خادم؛ لتفعيل أزرار Google / Apple ضع المعرّفات هنا:
 *
 *  • googleClientId — من Google Cloud Console → Credentials → OAuth client ID (نوع Web).
 *    أضف نطاق الموقع ضمن "Authorized JavaScript origins".
 *
 *    المعرّف نفسه يجب أن يُضبط على الخادم في السرّ GOOGLE_CLIENT_ID، لأن
 *    خادم المزامنة يتحقّق من أن رمز Google صادر لهذا التطبيق لا لغيره
 *    (مطالبة aud). اختلافهما يعني رفض كل محاولة دخول. انظر DEPLOY.md §٤.
 *
 *  • appleClientId  — "Services ID" من Apple Developer → Certificates, Identifiers & Profiles.
 *    appleRedirectURI يجب أن يطابق ما سُجّل في لوحة Apple ويعمل عبر HTTPS فقط.
 *
 * ما دامت القيم فارغة تظهر الأزرار معطّلة. يبقى أمام المستخدم خياران:
 * "المزامنة بمفتاح" (حساب بلا مقدّم خارجي)، أو "الدخول كضيف" فتُحفظ كل
 * البيانات محلياً في المتصفح.
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
