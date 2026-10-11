/** شاشة تسجيل الدخول — Google أو Apple، مع خيار الدخول كضيف. */

import { el, icon, toast } from '../ui.js';
import { signInWithGoogle, signInWithApple, signInAsGuest, hasGoogle, hasApple } from '../auth.js';
import { hijriDate } from '../datetime.js';
import { getState } from '../store.js';

function appleGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M16.37 12.78c.02 2.5 2.19 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.01-1.41 2.02-2.55 2.04-1.11.02-1.47-.66-2.75-.66-1.28 0-1.68.64-2.74.68-1.09.04-1.92-1.09-2.62-2.1-1.43-2.07-2.53-5.85-1.06-8.41.73-1.27 2.04-2.08 3.46-2.1 1.08-.02 2.09.72 2.75.72.66 0 1.89-.89 3.19-.76.54.02 2.07.22 3.05 1.65-.08.05-1.82 1.07-1.8 3.23M14.3 4.9c.59-.71.98-1.7.87-2.69-.85.03-1.87.56-2.48 1.27-.54.63-1.02 1.64-.89 2.6.94.08 1.91-.48 2.5-1.18');
  svg.append(path);
  return svg;
}

function googleGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const paths = [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ];
  for (const [fill, d] of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export function renderAuth(root, { navigate }) {
  const { settings } = getState();

  const providerBtn = (label, glyph, cls, handler, available, hint) => {
    const btn = el(`button.btn.${cls}.btn--block.btn--lg`, {
      type: 'button',
      disabled: !available,
      title: available ? '' : hint,
      onclick: async () => {
        btn.disabled = true;
        try {
          await handler();
          navigate(getState().onboarded ? '#/home' : '#/welcome');
        } catch (err) {
          toast(err.message || 'تعذّر إتمام تسجيل الدخول');
          btn.disabled = false;
        }
      },
    }, [glyph, label]);
    return btn;
  };

  const notConfigured = !hasGoogle() && !hasApple();

  const gate = el('div.gate', {}, [
    el('div.gate__top', {}, [
      el('span.pill.pill--soft', {}, [icon('dark_mode', { size: 14 }), 'الوضع الداكن من الإعدادات']),
      el('span.pill.pill--soft.tnum', { text: hijriDate() || 'تحدي الـ 30' }),
    ]),

    el('div', {}, [
      el('div.gate__logo', {}, [icon('spa')]),
      el('h1.gate__title', { text: 'تحدي الـ 30' }),
      el('p.gate__lede', { text: 'مرحباً بك مجدداً • ابدأ رحلة الالتزام والسكينة' }),
    ]),

    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.6rem' } }, [
      providerBtn('تسجيل الدخول عبر Apple', appleGlyph(), 'btn--dark', signInWithApple, hasApple(),
        'يتطلب ضبط معرّف Apple في assets/js/config.js'),
      providerBtn('المتابعة بواسطة Google', googleGlyph(), 'btn--white', signInWithGoogle, hasGoogle(),
        'يتطلب ضبط معرّف Google في assets/js/config.js'),
    ]),

    notConfigured
      ? el('p.field__hint', {
        style: { textAlign: 'center', lineHeight: '1.9' },
        text: 'لم تُضبط معرّفات Google / Apple بعد. يمكنك استخدام التطبيق كاملاً بالدخول المحلي، وتُحفظ بياناتك على هذا الجهاز.',
      })
      : null,

    el('div.divider', { text: 'أو' }),

    el('button.btn.btn--tonal.btn--block.btn--lg', {
      type: 'button',
      onclick: () => {
        signInAsGuest();
        navigate(getState().onboarded ? '#/home' : '#/welcome');
      },
    }, [icon('person', { size: 20 }), 'الدخول كضيف • تجربة التطبيق أولاً']),

    el('div.card', { style: { display: 'flex', gap: '.85rem', alignItems: 'flex-start' } }, [
      el('span.permcard__glyph.permcard__glyph--mint', {}, [icon('cloud_sync', { size: 22 })]),
      el('div', {}, [
        el('div.permcard__title', { text: 'بياناتك على جهازك' }),
        el('div.permcard__desc', { text: 'تُحفظ مهامك وعاداتك وتقدّمك في هذا المتصفح. لا تُرسل إلى أي خادم، ولا تُشارك مع أي طرف.' }),
      ]),
    ]),

    el('div.gate__foot', {}, [
      el('span', { text: 'باستخدامك التطبيق فأنت توافق على حفظ بياناتك محلياً على هذا الجهاز.' }),
    ]),
  ]);

  root.append(gate);
}
