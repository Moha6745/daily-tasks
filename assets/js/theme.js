/** تطبيق وضع المظهر: تلقائي حسب الجهاز، أو فاتح/داكن دائماً. */

const META_COLORS = { light: '#faf8ff', dark: '#0c1411' };

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  syncMetaColor();
}

/** يضبط لون شريط المتصفح ليطابق خلفية التطبيق. */
export function syncMetaColor() {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = dark ? META_COLORS.dark : META_COLORS.light;
}

/** يتابع تغيّر إعداد الجهاز عندما يكون الوضع "تلقائي". */
export function watchSystemTheme() {
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', syncMetaColor);
}
