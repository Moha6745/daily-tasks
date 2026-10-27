/**
 * الواجهة الرئيسية:
 *  — بطاقة كبيرة: اليوم + التاريخ الهجري والميلادي + الصلاة القادمة وما تبقّى عليها.
 *  — شريط تقدّم تحدي الـ 30.
 *  — خانات المهام: اليومية، ثم الأسبوعية، ثم الشهرية.
 *  — خانة إضافة سريعة فوق قائمة المهام اليومية، مع خيار التكرار.
 */

import { el, icon, toast, confirmSheet } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { getState } from '../store.js';
import {
  groupTasks, toggleTask, removeTask, isDoneNow, occurrenceKey, isOverdue, countOpen, challengeSummary,
  todaysTasks,
  taskIcon, addTask, repeatOf, recurringTasks, rescheduleToToday,
} from '../tasks.js';
import {
  todayKey, hijriDate, gregorianDate, weekdayName, taskDateLabel,
  formatTime, formatRemaining, WEEKDAYS_AR_SHORT, fromKey, shortDate,
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
  // اليوم الذي يخصّ المهمة قد لا يكون اليوم الجاري: الأسبوعية تُعرض في
  // قائمة الأسبوع قبل موعدها، فيُسجَّل إنجازها لموعدها لا ليوم الضغط.
  const day = occurrenceKey(task, today);
  const done = isDoneNow(task, today);
  const overdue = isOverdue(task, today);

  const check = el('button.check', {
    type: 'button',
    'aria-pressed': done ? 'true' : 'false',
    'aria-label': done ? `إلغاء إنجاز: ${task.title}` : `إتمام: ${task.title}`,
    onclick: (e) => {
      const btn = e.currentTarget;
      btn.classList.add('is-ringing');            // هالة ذهبية خفيفة قبل التثبيت
      const nowDone = toggleTask(task.id, day);
      setTimeout(() => {
        btn.classList.remove('is-ringing');
        rerender();
        if (nowDone) announceIfDayComplete();
      }, 220);
    },
  }, [icon('check', { size: 16 })]);

  const repeat = repeatOf(task);
  const meta = [];
  if (repeat === 'daily') {
    meta.push(el('span.task__repeat', {}, [icon('repeat', { size: 12 }), 'متكررة كل يوم']));
  } else if (repeat === 'weekly') {
    meta.push(el('span.task__repeat', {}, [
      icon('event_repeat', { size: 12 }), `كل ${weekdayName(fromKey(task.date))}`,
    ]));
  }
  if (repeat === 'none' && task.date !== today) {
    meta.push(el('span.task__date', {}, [icon('event', { size: 13 }), taskDateLabel(task.date)]));
  }
  if (overdue) {
    meta.push(el('span.pill.pill--error', { text: 'متأخرة' }));
    // المتأخرة تبقى بتاريخها فيُسجَّل إنجازها ليومه؛ وهذا الزرّ لمن أراد
    // استئنافها اليوم بدل ذلك، فينقل تاريخها إلى اليوم بضغطة واحدة
    meta.push(el('button.task__reschedule', {
      type: 'button',
      'aria-label': `نقل «${task.title}» إلى اليوم`,
      onclick: () => { rescheduleToToday(task.id); toast('نُقلت إلى اليوم'); rerender(); },
    }, [icon('event_repeat', { size: 13 }), 'تحديث للتاريخ']));
  }
  if (task.reminder) meta.push(el('span', {}, [icon('alarm', { size: 13 }), ` ${task.reminder}`]));
  if (done) meta.push(el('span', {}, [icon('check_circle', { size: 13 }), ' أُنجزت']));

  return el(`li.task${done ? '.task--done' : ''}`, { 'data-id': task.id }, [
    el('span.task__glyph', {}, [icon(taskIcon(task), { size: 20 })]),
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

function section({ title, badge, tasks, today, emptyText, rerender }) {
  return el('section', {}, [
    el('div.section-head', {}, [
      el('h2.section-head__title', {}, [el('span.dot'), title]),
      badge ? el('span.pill.pill--soft', { text: badge }) : null,
    ]),
    tasks.length
      ? el('ul.tasklist', {}, tasks.map((t) => taskRow(t, today, rerender)))
      : el('p.empty', { text: emptyText }),
  ]);
}

/* ----------------------------------------------------- إضافة سريعة */

/**
 * خانة تسجيل مهمة جديدة فوق قائمة المهام اليومية:
 * خيارا التكرار (كل يوم / كل أسبوع في اليوم نفسه)، وتاريخ المهمة في
 * علامة تقويم صغيرة يبدأ باليوم ويقبل التعديل.
 */
function quickAdd(rerender) {
  const today = todayKey();
  let repeat = 'none';
  let date = today;

  const input = el('input', {
    type: 'text',
    placeholder: 'سجّل مهمة جديدة لهذا اليوم…',
    'aria-label': 'مهمة جديدة',
    maxlength: '200',
    enterkeyhint: 'done',
  });

  /* ------------------------------------------- تاريخ المهمة المصغّر */
  const dateText = el('span.datechip__text');

  const dateInput = el('input.datechip__input', {
    type: 'date',
    value: today,
    min: '2000-01-01',
    'aria-label': 'تاريخ المهمة',
    onchange: (e) => {
      date = e.target.value || today;
      if (!e.target.value) e.target.value = today;
      syncDate();
    },
  });

  const dateChip = el('label.datechip', { 'aria-label': 'تاريخ المهمة' }, [
    icon('calendar_month', { size: 16 }),
    dateText,
    dateInput,
  ]);

  function syncDate() {
    // التكرار اليومي يعني «كل يوم»، فلا معنى لتاريخ غير اليوم
    if (repeat === 'daily') { date = today; dateInput.value = today; }
    dateInput.disabled = repeat === 'daily';
    dateChip.classList.toggle('is-disabled', repeat === 'daily');
    // تبقى علامة التقويم أيقونة وحدها ما دام التاريخ اليوم، ولا تكبر إلا إن تغيّر
    const label = repeat === 'weekly' ? `كل ${weekdayName(fromKey(date))}`
      : (date === today ? '' : taskDateLabel(date));
    dateText.textContent = label;
    dateChip.classList.toggle('datechip--bare', !label);
    dateChip.setAttribute('title', label ? `تاريخ المهمة: ${label}` : 'تاريخ المهمة: اليوم');
  }

  /* ------------------------------------------------ خيارا التكرار */
  const repeatChips = [
    { key: 'daily', glyph: 'repeat', text: 'متكررة كل يوم' },
    { key: 'weekly', glyph: 'event_repeat', text: 'متكررة كل أسبوع' },
  ].map((opt) => el('button.chip', {
    type: 'button',
    'aria-pressed': 'false',
    'data-repeat': opt.key,
    onclick: () => {
      repeat = repeat === opt.key ? 'none' : opt.key;   // الضغط ثانيةً يُلغي
      syncRepeat();
    },
  }, [icon(opt.glyph, { size: 16 }), opt.text]));

  function syncRepeat() {
    for (const chip of repeatChips) {
      chip.setAttribute('aria-pressed', chip.dataset.repeat === repeat ? 'true' : 'false');
    }
    syncDate();
  }

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    const created = addTask({ title: value, date, repeat });
    input.value = '';
    toast({
      daily: 'أُضيفت مهمة متكررة كل يوم',
      weekly: `أُضيفت مهمة متكررة كل ${weekdayName(fromKey(created.date))}`,
      none: created.date === today ? 'أُضيفت إلى مهام اليوم' : `أُضيفت ليوم ${taskDateLabel(created.date)}`,
    }[repeat]);
    repeat = 'none';
    date = today;
    dateInput.value = today;
    syncRepeat();
    rerender();
  };

  const form = el('form.quickadd', {
    'aria-label': 'تسجيل مهمة جديدة',
    onsubmit: (e) => { e.preventDefault(); submit(); },
  }, [
    el('div.quickadd__row', {}, [
      icon('edit_note', { size: 22, cls: 'quickadd__glyph' }),
      input,
      el('button.btn.btn--primary', {
        type: 'submit',
        style: { padding: '.55rem 1.1rem', boxShadow: 'none' },
      }, [icon('add', { size: 18 }), 'إضافة']),
    ]),
    el('div.quickadd__opts', {}, [...repeatChips, dateChip]),
  ]);

  syncRepeat();
  return form;
}

let celebrated = null;
function announceIfDayComplete() {
  const today = todayKey();
  const daily = todaysTasks(today);
  if (daily.length && countOpen(daily, today) === 0 && celebrated !== today) {
    celebrated = today;
    toast('أتممت كل مهام اليوم — تقبّل الله منك 🌿', { duration: 3600 });
  }
}

/* ------------------------------------------------------------ العرض */

export function renderHome(root, { rerender }) {
  const today = todayKey();
  const groups = groupTasks(today);

  const main = el('main.main', {}, [
    prayerCard(),
    challengeCard(),

    quickAdd(rerender),

    /* الجدول فوق مهام اليوم لا تحتها: هو الصورة الشهرية لما تحته، فمن فتح
       التطبيق رأى التزامه كاملاً قبل أن ينشغل بتعليم مهام يومه. */
    recurringTasks().length ? el('a.trackerlink', { href: '#/tracker' }, [
      el('span.trackerlink__start', {}, [
        icon('calendar_view_month', { size: 18 }),
        el('span', {}, [
          el('b', { text: 'جدول تحدي الـ 30' }),
          el('small', { text: 'يعرض المهام المتكررة اليومية' }),
        ]),
      ]),
      icon('chevron_left', { size: 20 }),
    ]) : null,

    section({
      title: 'المهام اليومية (اليوم)',
      badge: countOpen(groups.daily, today) ? `${countOpen(groups.daily, today)} متبقية` : 'مكتملة',
      tasks: groups.daily,
      today,
      emptyText: 'لا مهام لليوم بعد. اكتب أول مهمة في الخانة بالأعلى.',
      rerender,
    }),

    section({
      title: 'المهام الأسبوعية',
      badge: groups.weekly.length ? `${groups.weekly.length} مجدولة` : null,
      tasks: groups.weekly,
      today,
      emptyText: 'لا مهام مجدولة لبقية هذا الأسبوع.',
      rerender,
    }),

    section({
      title: 'المهام الشهرية',
      badge: groups.monthly.length ? 'مستقبلية' : null,
      tasks: groups.monthly,
      today,
      emptyText: 'لا مهام مجدولة بعد هذا الأسبوع.',
      rerender,
    }),
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
