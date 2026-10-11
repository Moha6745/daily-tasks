/**
 * الواجهة الرئيسية:
 *  — بطاقة كبيرة: اليوم + التاريخ الهجري والميلادي + الصلاة القادمة وما تبقّى عليها.
 *  — شريط تقدّم تحدي الـ 30.
 *  — خانات المهام: اليومية، ثم الأسبوعية، ثم الشهرية.
 *  — شريط إضافة سريعة أسفل القائمة.
 */

import { el, icon, toast, confirmSheet } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { getState } from '../store.js';
import { groupTasks, toggleTask, removeTask, isDone, isOverdue, countOpen, challengeSummary, CATEGORIES, addTask } from '../tasks.js';
import {
  todayKey, hijriDate, gregorianDate, weekdayName, taskDateLabel,
  formatTime, formatRemaining, WEEKDAYS_AR_SHORT, endOfWeekKey, fromKey, shortDate,
} from '../datetime.js';
import { nextPrayer } from '../prayer.js';
import { activeCoords } from '../location.js';

let tick = null;

/* --------------------------------------------- بطاقة التاريخ والصلاة */

function prayerCard() {
  const now = new Date();
  const { lat, lon } = activeCoords();
  const { settings } = getState();

  let next = null;
  try {
    next = nextPrayer({ lat, lon, method: settings.calcMethod, asr: settings.asrMethod, now });
  } catch { /* تُعرض البطاقة دون عدّاد */ }

  const hijri = hijriDate(now);

  return el('a.prayercard', { href: '#/prayer', 'aria-label': 'عرض كافة مواقيت الصلاة واتجاه القبلة' }, [
    el('div.prayercard__body', {}, [
      el('div.prayercard__row', {}, [
        el('div', {}, [
          el('div.prayercard__day', {}, [
            icon('calendar_today', { size: 18 }),
            el('strong', { text: weekdayName(now) }),
          ]),
          el('div.prayercard__dates', {}, [
            hijri ? el('span', { text: hijri }) : null,
            hijri ? el('i') : null,
            el('span', { class: 'tnum', text: gregorianDate(now) }),
          ]),
        ]),
        el('span.pill.pill--glass', {}, [icon('wb_twilight', { size: 15 }), 'الصلوات']),
      ]),

      el('div.prayercard__next', {}, [
        el('div.prayercard__nextinfo', {}, [
          el('span.prayercard__glyph', {}, [icon('mosque', { size: 24 })]),
          el('div', {}, [
            el('div.prayercard__label', { text: next ? 'الصلاة القادمة' : 'مواقيت الصلاة' }),
            el('div.prayercard__name', {
              text: next ? `صلاة ${next.meta.name} • ${formatTime(next.at)}` : 'حدّد موقعك لعرض المواقيت',
            }),
          ]),
        ]),
        next
          ? el('span.pill.pill--gold.tnum', { 'data-countdown': '', text: `متبقي: ${formatRemaining(next.minutesLeft)}` })
          : null,
      ]),

      el('div.prayercard__cta', {}, [
        el('span', {}, [icon('explore', { size: 15 }), 'عرض كافة مواقيت الصلاة واتجاه القبلة']),
        icon('arrow_outward', { size: 18 }),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------- شريط تقدّم التحدي */

function challengeCard() {
  const s = challengeSummary();

  const weekCells = s.week.map((d, i) => el(
    `div.week__cell${d.completed ? '.week__cell--done' : ''}${d.isToday ? '.week__cell--today' : ''}`,
    {},
    [
      el('span.week__label', { text: WEEKDAYS_AR_SHORT[i] }),
      el('span.week__num.tnum', {}, [
        d.completed && !d.isToday ? icon('check', { size: 16 }) : String(d.date.getDate()),
      ]),
    ],
  ));

  return el('section.card', { 'aria-label': 'تقدّم تحدي الثلاثين يوماً' }, [
    el('div.challenge__top', {}, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '.6rem' } }, [
        el('span.challenge__badge', {}, [icon('military_tech', { size: 18 })]),
        el('div', {}, [
          el('div.challenge__title', { text: `اليوم ${s.dayNumber} من ${s.length}` }),
          el('div.challenge__sub', {
            text: s.totalToday
              ? `أنجزت ${s.doneToday} من ${s.totalToday} من مهام اليوم`
              : 'أضف مهامك لتبدأ عدّ اليوم',
          }),
        ]),
      ]),
      el('div.challenge__pct.tnum', {}, [`${s.percent}%`, el('small', { text: 'اليوم' })]),
    ]),
    el('div.track', { role: 'progressbar', 'aria-valuenow': s.percent, 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
      el('div.track__fill', { style: { width: `${s.percent}%` } }),
    ]),
    el('div.week', {}, weekCells),
  ]);
}

/* ------------------------------------------------------ صفوف المهام */

function taskRow(task, today, rerender) {
  const done = isDone(task, today);
  const overdue = isOverdue(task, today);
  const cat = CATEGORIES[task.category] || CATEGORIES.spiritual;

  const check = el('button.check', {
    type: 'button',
    'aria-pressed': done ? 'true' : 'false',
    'aria-label': done ? `إلغاء إنجاز: ${task.title}` : `إتمام: ${task.title}`,
    onclick: (e) => {
      const btn = e.currentTarget;
      btn.classList.add('is-ringing');            // هالة ذهبية خفيفة قبل التثبيت
      const nowDone = toggleTask(task.id, today);
      setTimeout(() => {
        btn.classList.remove('is-ringing');
        rerender();
        if (nowDone) announceIfDayComplete();
      }, 220);
    },
  }, [icon('check', { size: 16 })]);

  const meta = [];
  if (task.repeatDaily) {
    meta.push(el('span.task__repeat', {}, [icon('repeat', { size: 12 }), 'متكررة يومياً']));
  }
  if (!task.repeatDaily && task.date !== today) {
    meta.push(el('span.task__date', {}, [icon('event', { size: 13 }), taskDateLabel(task.date)]));
  }
  if (overdue) meta.push(el('span.pill.pill--error', { text: 'متأخرة' }));
  if (task.reminder) meta.push(el('span', {}, [icon('alarm', { size: 13 }), ` ${task.reminder}`]));
  if (done) meta.push(el('span', {}, [icon('check_circle', { size: 13 }), ' أُنجزت']));

  return el(`li.task${done ? '.task--done' : ''}`, { 'data-id': task.id }, [
    el('span.task__glyph', {}, [icon(cat.icon, { size: 20 })]),
    el('div.task__body', {}, [
      el('div.task__title', { text: task.title }),
      meta.length ? el('div.task__meta', {}, meta) : null,
    ]),
    el('div.task__actions', {}, [
      el('button.iconbtn.iconbtn--sm', {
        type: 'button',
        'aria-label': `حذف: ${task.title}`,
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'حذف المهمة؟',
            desc: task.title,
            confirmText: 'حذف',
            danger: true,
          });
          if (ok) { removeTask(task.id); toast('حُذفت المهمة'); rerender(); }
        },
      }, [icon('delete', { size: 18 })]),
      check,
    ]),
  ]);
}

function section({ title, badge, hint, tasks, today, emptyText, rerender }) {
  return el('section', {}, [
    el('div.section-head', {}, [
      el('h2.section-head__title', {}, [el('span.dot'), title]),
      badge ? el('span.pill.pill--soft', { text: badge }) : null,
    ]),
    hint ? el('p.field__hint', { style: { paddingInline: '.25rem', marginBottom: '.4rem' }, text: hint }) : null,
    tasks.length
      ? el('ul.tasklist', {}, tasks.map((t) => taskRow(t, today, rerender)))
      : el('p.empty', { text: emptyText }),
  ]);
}

/* ----------------------------------------------------- إضافة سريعة */

function quickAdd(rerender) {
  const input = el('input', {
    type: 'text',
    placeholder: 'أضف مهمة جديدة لهذا اليوم…',
    'aria-label': 'مهمة جديدة لليوم',
    maxlength: '200',
    enterkeyhint: 'done',
  });

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    addTask({ title: value });
    input.value = '';
    toast('أُضيفت إلى مهام اليوم');
    rerender();
  };

  const form = el('form.quickadd', {
    onsubmit: (e) => { e.preventDefault(); submit(); },
  }, [
    icon('edit_note', { size: 22, cls: 'quickadd__glyph' }),
    input,
    el('button.btn.btn--primary', {
      type: 'submit',
      style: { padding: '.55rem 1.1rem', boxShadow: 'none' },
    }, [icon('add', { size: 18 }), 'إضافة']),
  ]);
  return form;
}

let celebrated = null;
function announceIfDayComplete() {
  const today = todayKey();
  const daily = groupTasks(today).daily;
  if (daily.length && countOpen(daily, today) === 0 && celebrated !== today) {
    celebrated = today;
    toast('أتممت كل مهام اليوم — تقبّل الله منك 🌿', { duration: 3600 });
  }
}

/* ------------------------------------------------------------ العرض */

export function renderHome(root, { rerender }) {
  const today = todayKey();
  const groups = groupTasks(today);
  const weekEnd = fromKey(endOfWeekKey(fromKey(today)));

  const main = el('main.main', {}, [
    prayerCard(),
    challengeCard(),

    section({
      title: 'المهام اليومية (اليوم)',
      badge: countOpen(groups.daily, today) ? `${countOpen(groups.daily, today)} متبقية` : 'مكتملة',
      tasks: groups.daily,
      today,
      emptyText: 'لا مهام لليوم بعد. اكتب أول مهمة في الشريط بالأسفل.',
      rerender,
    }),

    section({
      title: 'المهام الأسبوعية',
      badge: groups.weekly.length ? `${groups.weekly.length} مجدولة` : null,
      hint: `من الغد وحتى السبت ${shortDate(weekEnd)}`,
      tasks: groups.weekly,
      today,
      emptyText: 'لا مهام مجدولة لبقية هذا الأسبوع.',
      rerender,
    }),

    section({
      title: 'المهام الشهرية',
      badge: groups.monthly.length ? 'مستقبلية' : null,
      hint: 'ما بعد سبت هذا الأسبوع',
      tasks: groups.monthly,
      today,
      emptyText: 'لا مهام مجدولة بعد هذا الأسبوع.',
      rerender,
    }),

    quickAdd(rerender),
  ]);

  root.append(appbar(), main, navbar('home'));
  startCountdown(root);
}

/** يحدّث عدّاد الصلاة القادمة كل 30 ثانية دون إعادة رسم الصفحة. */
function startCountdown(root) {
  stopCountdown();
  tick = setInterval(() => {
    const badge = root.querySelector('[data-countdown]');
    if (!badge) return stopCountdown();
    try {
      const { lat, lon } = activeCoords();
      const { settings } = getState();
      const next = nextPrayer({ lat, lon, method: settings.calcMethod, asr: settings.asrMethod });
      badge.textContent = `متبقي: ${formatRemaining(next.minutesLeft)}`;
    } catch { /* تجاهل */ }
  }, 30000);
}

export function stopCountdown() {
  if (tick) { clearInterval(tick); tick = null; }
}
