/**
 * عنوان التطبيق الذي يفتحه الغلاف.
 *
 * الافتراضي هو الإنتاج، فيعمل الغلاف بلا إعداد. ولتجربة نسخة محلية قبل
 * النشر: شغّل `npm run dev:static` في جذر المستودع، ثم مرّر عنوان جهازك
 * على الشبكة (لا `localhost` فهو يعني الهاتف نفسه):
 *
 *   EXPO_PUBLIC_APP_URL=http://192.168.1.5:8080 npx expo start
 */
export const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL || 'https://daily-tasks-a27.pages.dev/';

/** ألوان الخلفية قبل أن يرسم الويب نفسه — مأخوذة من `--bg` في app.css. */
export const SHELL_BG = { light: '#faf8ff', dark: '#0c1411' };
