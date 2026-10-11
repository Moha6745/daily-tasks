/** صفحة مواقيت الصلاة وبوصلة القبلة. */

import { el, icon, toast, progressRing, sheet } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { getState } from '../store.js';
import { prayerTimes, nextPrayer, PRAYER_META, METHODS } from '../prayer.js';
import { qiblaBearing, distanceToKaaba, bearingName, watchHeading, requestCompassPermission } from '../qibla.js';
import { activeCoords, requestLocation, CITIES, setCity } from '../location.js';
import { formatTime, formatRemaining, hijriDate, gregorianDate, weekdayName } from '../datetime.js';

let timer = null;
let stopCompass = null;

/* ----------------------------------------------------- شريط الموقع */

function locationBar(rerender) {
  const coords = activeCoords();
  const sourceLabel = {
    gps: 'تحديد تلقائي عبر الجهاز',
    manual: 'مدينة مختارة يدوياً',
    default: 'الموقع الافتراضي',
  }[coords.source] || '';

  return el('div.card.locbar', {}, [
    el('div', {}, [
      el('div.locbar__city', { text: coords.label || 'موقعك' }),
      el('div.locbar__sub', { text: `${sourceLabel} • ${METHODS[getState().settings.calcMethod]?.name || ''}` }),
    ]),
    el('div', { style: { display: 'flex', gap: '.35rem' } }, [
      el('button.iconbtn', {
        type: 'button', 'aria-label': 'اختيار المدينة يدوياً',
        onclick: () => openCityPicker(rerender),
      }, [icon('location_city', { size: 22 })]),
      el('button.iconbtn', {
        type: 'button', 'aria-label': 'تحديث الموقع تلقائياً',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.style.opacity = '.5';
          try {
            const c = await requestLocation();
            toast(`حُدّد موقعك: ${c.label}`);
            rerender();
          } catch (err) {
            toast(err.message);
            btn.style.opacity = '';
          }
        },
      }, [icon('my_location', { size: 22 })]),
    ]),
  ]);
}

function openCityPicker(rerender) {
  sheet({
    title: 'اختر مدينتك',
    desc: 'تُحسب المواقيت واتجاه القبلة بناءً على المدينة المختارة.',
    content: (close) => {
      const list = el('div.chips', { style: { maxHeight: '45dvh', overflowY: 'auto' } },
        CITIES.map((c) => el('button.chip', {
          type: 'button',
          text: c.label,
          'aria-pressed': activeCoords().label === c.label ? 'true' : 'false',
          onclick: () => { setCity(c.label); close(); toast(`المدينة: ${c.label}`); rerender(); },
        })));
      return list;
    },
  });
}

/* ------------------------------------------------- عدّاد الصلاة القادمة */

function countdownCard() {
  const { lat, lon } = activeCoords();
  const { settings } = getState();
  const now = new Date();
  const next = nextPrayer({ lat, lon, method: settings.calcMethod, asr: settings.asrMethod, now });

  // نسبة ما انقضى من الفترة بين الصلاة السابقة والقادمة
  let percent = 0;
  if (next.previous?.at && next.at) {
    const span = next.at - next.previous.at;
    percent = span > 0 ? Math.round(((now - next.previous.at) / span) * 100) : 0;
  }
  percent = Math.max(0, Math.min(100, percent));

  const ring = el('div.ringwrap', {}, [
    progressRing(percent, { size: 88, stroke: 7 }),
    el('div.ringwrap__label', {}, [el('span', {}, [`${percent}%`, el('small', { text: 'مضى' })])]),
  ]);

  return el('section.countdown', { 'aria-label': 'الصلاة القادمة' }, [
    el('div.countdown__inner', {}, [
      el('div.countdown__head', {}, [
        el('span.pill.pill--gold', {}, [icon('alarm', { size: 14 }), formatTime(next.at)]),
        el('span', { style: { fontSize: '12px', color: 'var(--on-primary-container)' } }, [
          el('span.dot', { style: { display: 'inline-block', marginInlineEnd: '.35rem' } }),
          `أذان ${next.meta.name}${next.tomorrow ? ' (غداً)' : ''}`,
        ]),
      ]),
      el('div.countdown__main', {}, [
        ring,
        el('div', { style: { textAlign: 'start', flex: '1' } }, [
          el('div.countdown__cap', { text: 'متبقٍ على النداء' }),
          el('div.countdown__value.tnum', { text: formatRemaining(next.minutesLeft) }),
          el('div.countdown__verse', { text: '«حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ»' }),
        ]),
      ]),
      next.previous?.at
        ? el('div.countdown__bar', {}, [
          el('div.countdown__bartop', {}, [
            el('span', { text: formatTime(next.at) }),
            el('span', { text: formatTime(next.previous.at) }),
          ]),
          el('div.countdown__track', {}, [el('div.countdown__trackfill', { style: { width: `${percent}%` } })]),
        ])
        : null,
    ]),
  ]);
}

/* ------------------------------------------------------ جدول المواقيت */

function timesList() {
  const { lat, lon } = activeCoords();
  const { settings } = getState();
  const now = new Date();
  const times = prayerTimes({ lat, lon, date: now, method: settings.calcMethod, asr: settings.asrMethod });
  const next = nextPrayer({ lat, lon, method: settings.calcMethod, asr: settings.asrMethod, now });

  const rows = PRAYER_META.map((p) => {
    const at = times[p.id];
    const isNext = !next.tomorrow && p.id === next.id;
    const isPast = at && at < now && !isNext;

    return el(`div.prayerrow${isNext ? '.prayerrow--next' : ''}${isPast ? '.prayerrow--past' : ''}`, {}, [
      el('span.prayerrow__glyph', {}, [
        icon(p.icon, { size: 22 }),
        isNext ? el('span.ping') : null,
      ]),
      el('div.prayerrow__body', {}, [
        el('div.prayerrow__name', {}, [
          p.name,
          isNext ? el('span.pill.pill--mint', { text: 'التالية' }) : null,
          p.id === 'maghrib' ? el('span.pill.pill--sand', { text: 'موعد الإفطار' }) : null,
        ]),
        el('div.prayerrow__desc', {
          text: isNext ? `بعد ${formatRemaining(next.minutesLeft)}` : p.desc,
        }),
      ]),
      el('span.prayerrow__time.tnum', { text: at ? formatTime(at) : 'غير متاح' }),
    ]);
  });

  const unavailable = PRAYER_META.some((p) => !times[p.id]);

  return el('section', {}, [
    el('div.section-head', {}, [
      el('h2.section-head__title', {}, [icon('schedule', { size: 20 }), 'مواقيت اليوم']),
      el('span.pill.pill--soft', { text: METHODS[settings.calcMethod]?.name.split('(')[0].trim() || '' }),
    ]),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.5rem' } }, rows),
    unavailable
      ? el('p.field__hint', { style: { marginTop: '.5rem' }, text: 'بعض المواقيت غير محسوبة في خطوط العرض العالية خلال هذا الموسم. جرّب طريقة حساب أخرى من الإعدادات.' })
      : null,
  ]);
}

/* ------------------------------------------------------------- القبلة */

function qiblaCard() {
  const coords = activeCoords();
  const bearing = qiblaBearing(coords.lat, coords.lon);
  const distance = distanceToKaaba(coords.lat, coords.lon);

  // الحروف داخل القرص لتدور معه عند تفعيل الحساس فيبقى الشمال شمالاً
  const dial = el('div.compass__dial', {}, [
    el('span.compass__cardinal.compass__cardinal--n', { text: 'ش (N)' }),
    el('span.compass__cardinal.compass__cardinal--s', { text: 'ج (S)' }),
    el('span.compass__cardinal.compass__cardinal--e', { text: 'ق (E)' }),
    el('span.compass__cardinal.compass__cardinal--w', { text: 'غ (W)' }),
  ]);
  const needle = el('div.compass__needle', { 'aria-hidden': 'true' }, [
    el('i', {}, [icon('navigation', { size: 18, fill: true })]),
    el('b'),
  ]);
  needle.style.transform = `rotate(${bearing}deg)`;

  const compass = el('div.compass', {
    role: 'img',
    'aria-label': `اتجاه القبلة ${bearing.toFixed(1)} درجة ${bearingName(bearing)}`,
  }, [
    dial,
    el('div.compass__ring'),
    el('div.compass__ring.compass__ring--2'),
    needle,
    el('span.compass__center', {}, [icon('mosque', { size: 26 })]),
  ]);

  const statusPill = el('span.pill.pill--mint', { text: 'فعّل البوصلة لتوجيه دقيق' });

  const enableBtn = el('button.btn.btn--ghost', {
    type: 'button',
    style: { padding: '.5rem 1rem', fontSize: '12px' },
    onclick: async (e) => {
      const ok = await requestCompassPermission();
      if (!ok) { toast('حساس الاتجاه غير متاح على هذا الجهاز'); return; }
      e.currentTarget.remove();
      startCompass();
    },
  }, [icon('explore', { size: 16 }), 'تفعيل حساس الاتجاه']);

  function startCompass() {
    stopCompass?.();
    stopCompass = watchHeading((heading) => {
      // ندير القرص عكس اتجاه الجهاز ليبقى الشمال ثابتاً، والإبرة على زاوية القبلة
      dial.style.transform = `rotate(${-heading}deg)`;
      needle.style.transform = `rotate(${bearing - heading}deg)`;
      const diff = Math.abs(((bearing - heading + 540) % 360) - 180);
      const aligned = diff < 6;
      compass.classList.toggle('is-aligned', aligned);
      statusPill.textContent = aligned
        ? 'الهاتف موجّه نحو القبلة المشرّفة'
        : `أدر الجهاز ${Math.round(diff)}° ${((bearing - heading + 360) % 360) < 180 ? 'يميناً' : 'يساراً'}`;
      statusPill.className = aligned ? 'pill pill--gold' : 'pill pill--mint';
    });
    if (!stopCompass) toast('حساس الاتجاه غير مدعوم — استخدم الزاوية المعروضة');
  }

  return el('section', {}, [
    el('div.section-head', {}, [
      el('h2.section-head__title', {}, [icon('explore', { size: 20 }), 'بوصلة القبلة']),
    ]),
    el('div.card.qibla', {}, [
      statusPill,
      compass,
      el('div.qibla__readout', {}, [
        el('span.qibla__deg.tnum', { text: `${bearing.toFixed(1)}°` }),
        el('span.qibla__dir', { text: bearingName(bearing) }),
        el('div.qibla__sub', { text: `مكة المكرمة • المسافة المباشرة ${distance.toLocaleString('ar-EG')} كم تقريباً` }),
      ]),
      enableBtn,
      el('p.field__hint', { style: { textAlign: 'center' }, text: 'للحصول على قراءة دقيقة ضع الجهاز أفقياً بعيداً عن المعادن والأجهزة الكهربائية.' }),
    ]),
  ]);
}

/* ------------------------------------------------------------- العرض */

export function renderPrayer(root, { rerender }) {
  const now = new Date();
  const hijri = hijriDate(now);

  const main = el('main.main', {}, [
    el('div', { style: { textAlign: 'center' } }, [
      el('h1', { style: { fontSize: '22px', fontWeight: '800' }, text: `${weekdayName(now)}` }),
      el('p.field__hint', { text: [hijri, gregorianDate(now)].filter(Boolean).join(' • ') }),
    ]),
    locationBar(rerender),
    countdownCard(),
    timesList(),
    qiblaCard(),
    el('a.btn.btn--primary.btn--block.btn--lg', { href: '#/home' }, [
      icon('arrow_back', { size: 18 }), 'العودة للرئيسية والمهام',
    ]),
  ]);

  root.append(appbar(), main, navbar('prayer'));

  // تحديث العدّاد كل دقيقة
  stopPrayerTimers();
  timer = setInterval(() => {
    if (!document.body.contains(main)) return stopPrayerTimers();
    if (window.location.hash.startsWith('#/prayer')) rerender();
  }, 60000);
}

export function stopPrayerTimers() {
  if (timer) { clearInterval(timer); timer = null; }
  if (stopCompass) { stopCompass(); stopCompass = null; }
}
