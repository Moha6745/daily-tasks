/**
 * شاشة الأذونات — تظهر مرة واحدة فقط عند أول دخول،
 * ويمكن تعديل كل خيار لاحقاً من الإعدادات.
 */

import { el, icon } from '../ui.js';
import { update } from '../store.js';
import { requestLocation } from '../location.js';
import { requestPermission as requestNotifications, permission as notifPermission, supported as notifSupported } from '../notifications.js';

function permCard({ glyph, glyphClass, title, desc, actionText, skipText, onAction, onSkip }) {
  const status = el('span.status', { text: 'لم يُفعّل بعد' });

  const actionBtn = el('button.btn.btn--primary', { type: 'button' }, [
    icon(glyph === 'notifications' ? 'notifications_active' : 'my_location', { size: 18 }),
    actionText,
  ]);

  actionBtn.addEventListener('click', async () => {
    actionBtn.disabled = true;
    try {
      const label = await onAction();
      status.textContent = label || 'مُفعّل';
      status.className = 'status status--on';
      actionBtn.textContent = 'تم التفعيل';
    } catch (err) {
      status.textContent = err.message || 'لم يُمنح الإذن';
      status.className = 'status status--off';
      actionBtn.disabled = false;
    }
  });

  return el('div.card.permcard', {}, [
    el('div.permcard__head', {}, [
      el(`span.permcard__glyph.${glyphClass}`, {}, [icon(glyph, { size: 24 })]),
      el('div', {}, [
        el('div.permcard__title', { text: title }),
        el('div.permcard__desc', { text: desc }),
      ]),
    ]),
    status,
    el('div.permcard__actions', {}, [
      actionBtn,
      el('button.btn.btn--tonal', {
        type: 'button', text: skipText,
        onclick: () => { onSkip?.(); status.textContent = 'تم التخطي — يمكن تفعيله من الإعدادات'; status.className = 'status'; },
      }),
    ]),
  ]);
}

export function renderOnboarding(root, { navigate }) {
  const gate = el('div.gate', {}, [
    el('div', { style: { textAlign: 'center' } }, [
      el('div.gate__logo', {}, [icon('spa')]),
      el('span.pill.pill--mint', { style: { marginTop: '1.4rem' }, text: 'تحدي الـ 30 يوماً المبارك' }),
      el('h1.gate__title', { text: '✨ مرحباً بك في تحدي الـ 30' }),
      el('p.gate__lede', { text: 'خطوتك اليومية نحو التوازن والإنتاجية والمحافظة على طاعاتك وعاداتك بروح ملؤها السكينة.' }),
    ]),

    permCard({
      glyph: 'near_me',
      glyphClass: 'permcard__glyph--mint',
      title: 'السماح بتحديد الموقع الجغرافي',
      desc: 'نحتاج موقعك لتحديد التوقيت المحلي الدقيق وحساب مواقيت الصلاة واتجاه القبلة لمدينتك بدقة متناهية.',
      actionText: 'السماح أثناء استخدام التطبيق',
      skipText: 'لاحقاً',
      onAction: async () => {
        const coords = await requestLocation();
        return `مسموح — ${coords.label}`;
      },
      onSkip: () => update({ settings: { locationEnabled: false } }),
    }),

    permCard({
      glyph: 'notifications',
      glyphClass: 'permcard__glyph--sand',
      title: 'السماح بتلقي الإشعارات اليومية',
      desc: 'سنذكّرك مرتين في اليوم فقط: عند بداية اليوم (الفجر) وعند قرب نهايته (11:00 ليلاً) لمراجعة إنجازك.',
      actionText: 'تفعيل التنبيهات',
      skipText: 'تخطي',
      onAction: async () => {
        if (!notifSupported()) throw new Error('المتصفح لا يدعم الإشعارات');
        const granted = await requestNotifications();
        if (!granted) throw new Error(notifPermission() === 'denied' ? 'رُفض الإذن من المتصفح' : 'لم يُمنح الإذن');
        return 'مسموح — تذكيرات الفجر و11 ليلاً';
      },
      onSkip: () => update({ settings: { notificationsEnabled: false } }),
    }),

    el('p.field__hint', {
      style: { display: 'flex', gap: '.5rem', alignItems: 'flex-start', lineHeight: '1.9' },
    }, [
      icon('info', { size: 16 }),
      'تظهر هذه الأذونات مرة واحدة عند الدخول الأول، ويمكنك تعديلها لاحقاً في أي وقت من الإعدادات.',
    ]),

    el('button.btn.btn--primary.btn--block.btn--lg', {
      type: 'button',
      onclick: () => {
        update({ onboarded: true });
        navigate('#/home');
      },
    }, [icon('arrow_back', { size: 20 }), 'بدء التحدي والدخول للتطبيق']),
  ]);

  root.append(gate);
}
