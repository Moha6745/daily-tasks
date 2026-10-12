/** الشريط العلوي وشريط التنقل السفلي المشتركان بين الشاشات. */

import { el, icon } from '../ui.js';
import { getState } from '../store.js';
import { activeCoords } from '../location.js';

const NAV = [
  { route: 'home',     label: 'الرئيسية',      icon: 'check_circle' },
  { route: 'prayer',   label: 'المواقيت والقبلة', icon: 'explore' },
  { route: 'settings', label: 'الإعدادات',     icon: 'tune' },
];

export function appbar({ onProfile } = {}) {
  const user = getState().user;
  const initial = (user?.name || 'ض').trim().charAt(0);

  const avatar = user?.picture
    ? el('span.avatar', {}, [el('img', { src: user.picture, alt: user.name || 'الملف الشخصي', referrerpolicy: 'no-referrer' })])
    : el('span.avatar', { text: initial, 'aria-hidden': 'true' });

  return el('header.appbar', {}, [
    el('div.appbar__inner', {}, [
      el('div.brand', {}, [
        el('span.brand__mark', {}, [icon('spa', { size: 22 })]),
        el('div', {}, [
          el('div.brand__name', { text: 'تحدي الـ 30' }),
          el('div.brand__sub', { text: activeCoords().label || '' }),
        ]),
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '.25rem' } }, [
        el('a.iconbtn', { href: '#/settings', 'aria-label': 'التنبيهات والإعدادات' }, [icon('notifications', { size: 24 })]),
        el('button.iconbtn.iconbtn--sm', {
          type: 'button',
          'aria-label': 'الملف الشخصي',
          onclick: () => (onProfile ? onProfile() : (window.location.hash = '#/settings')),
        }, [avatar]),
      ]),
    ]),
  ]);
}

export function navbar(active) {
  const item = (cfg) => el('a.navitem', {
    href: `#/${cfg.route}`,
    'aria-current': active === cfg.route ? 'page' : null,
  }, [icon(cfg.icon, { size: 24 }), el('span', { text: cfg.label })]);

  return el('nav.navbar', { 'aria-label': 'التنقل الرئيسي' }, [
    el('div.navbar__inner', {}, [
      item(NAV[0]),
      item(NAV[1]),
      el('a.fab', {
      href: '#/memorize',
      'aria-label': 'الحفظ — جدول حفظ القرآن',
      'aria-current': active === 'memorize' ? 'page' : null,
    }, [icon('auto_stories', { size: 26 }), el('span.fab__label', { text: 'الحفظ' })]),
      item(NAV[2]),
    ]),
  ]);
}
