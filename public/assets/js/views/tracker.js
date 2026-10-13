/**
 * جدول متابعة المهام المتكررة على مدار الشهر.
 *
 * الأيام عموداً على اليمين، والمهام صفّاً أفقياً في الأعلى، وفي التقاطع
 * علامة إنجاز ذلك اليوم. والعلامة هي عينها التي تُوضع في القائمة الرئيسية
 * — لا نسخة عنها — فإنجازُ اليوم يظهر في الجدول فوراً والعكس بالعكس.
 *
 * والجدول قابل للتعديل في الأيام الماضية: من أنجز مهامه ونسي تعليمها حتى
 * الغد يضع العلامة في يومها هنا، فلا يضيع عمله لمجرّد أنه تأخّر في تسجيله.
 */

import { el, icon, toast } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { recurringTasks, toggleTask, isDone, occursOn, repeatOf, CATEGORIES } from '../tasks.js';
import {
  todayKey, dateKey, fromKey, monthDays, monthLabel, startOfMonth, addMonths,
  WEEKDAYS_AR_SHORT, weekdayName, shortDate,
} from '../datetime.js';

/** الشهر المعروض؛ يبقى بين إعادات الرسم ليثبت تنقّل المستخدم بين الشهور. */
let viewMonth = null;

export function resetTrackerMonth() {
  viewMonth = null;
}

function headCell(task) {
  const cat = CATEGORIES[task.category] || CATEGORIES.spiritual;
  const repeat = repeatOf(task);
  return el('th.tracker__head', { scope: 'col', title: task.title }, [
    el('span.tracker__headglyph', {}, [icon(cat.icon, { size: 15 })]),
    el('span.tracker__headname', { text: task.title }),
    el('span.tracker__headrepeat', {
      text: repeat === 'daily' ? 'كل يوم' : `كل ${weekdayName(fromKey(task.date))}`,
    }),
  ]);
}

export function renderTracker(root, { rerender }) {
  const today = todayKey();
  if (!viewMonth) viewMonth = startOfMonth(new Date());

  const tasks = recurringTasks();
  const days = monthDays(viewMonth);
  const isCurrentMonth = dateKey(startOfMonth(new Date())) === dateKey(viewMonth);

  /* ------------------------------------------------- التنقّل بين الشهور */
  const monthBar = el('div.tracker__month', {}, [
    el('button.iconbtn.iconbtn--sm', {
      type: 'button', 'aria-label': 'الشهر السابق',
      onclick: () => { viewMonth = addMonths(viewMonth, -1); rerender(); },
    }, [icon('chevron_right', { size: 20 })]),
    el('div', { style: { textAlign: 'center' } }, [
      el('div.tracker__monthname', { text: monthLabel(viewMonth) }),
      el('div.field__hint', { text: `${days.length} يوماً` }),
    ]),
    el('button.iconbtn.iconbtn--sm', {
      type: 'button',
      'aria-label': 'الشهر التالي',
      disabled: isCurrentMonth ? true : null,     // لا متابعة لشهر لم يأتِ
      onclick: () => { viewMonth = addMonths(viewMonth, 1); rerender(); },
    }, [icon('chevron_left', { size: 20 })]),
  ]);

  if (!tasks.length) {
    const main = el('main.main', {}, [
      monthBar,
      el('p.empty', { text: 'لا مهام متكررة بعد. أضف مهمة واجعلها «متكررة كل يوم» أو «كل أسبوع» لتتابعها هنا.' }),
      el('a.btn.btn--primary.btn--block', { href: '#/home' }, [icon('add', { size: 18 }), 'إضافة مهمة متكررة']),
    ]);
    root.append(appbar(), main, navbar('tracker'));
    return;
  }

  /* ------------------------------------------------------- صفوف الأيام */
  const doneInMonth = new Map(tasks.map((t) => [t.id, 0]));

  const rows = days.map((d) => {
    const key = dateKey(d);
    const isToday = key === today;
    const future = key > today;

    const cells = tasks.map((task) => {
      const applies = occursOn(task, key);
      if (!applies) {
        // المهمة الأسبوعية لا تقع في هذا اليوم، فالخلية ليست محلّ إنجاز
        return el('td.tracker__cell', {}, [el('span.tracker__na', { 'aria-label': 'لا تقع في هذا اليوم', text: '—' })]);
      }

      const done = isDone(task, key);
      if (done) doneInMonth.set(task.id, doneInMonth.get(task.id) + 1);

      return el('td.tracker__cell', {}, [
        el(`button.check.check--sm${future ? '.is-future' : ''}`, {
          type: 'button',
          'aria-pressed': done ? 'true' : 'false',
          'aria-label': `${task.title} — ${weekdayName(d)} ${shortDate(d)}`,
          disabled: future ? true : null,          // يومٌ لم يأتِ بعد لا يُنجَز
          onclick: () => {
            const now = toggleTask(task.id, key);
            if (key !== today) {
              toast(now ? `سُجّل إنجاز ${shortDate(d)}` : `أُلغي إنجاز ${shortDate(d)}`);
            }
            rerender();
          },
        }, [icon('check', { size: 13 })]),
      ]);
    });

    return el(`tr.tracker__row${isToday ? '.tracker__row--today' : ''}${future ? '.tracker__row--future' : ''}`, {}, [
      el('th.tracker__day', { scope: 'row' }, [
        el('b.tnum', { text: String(d.getDate()) }),
        el('small', { text: WEEKDAYS_AR_SHORT[d.getDay()] }),
      ]),
      ...cells,
    ]);
  });

  /* ------------------------------------------------- صفّ حصيلة الشهر */
  const totals = el('tr.tracker__row.tracker__row--total', {}, [
    el('th.tracker__day', { scope: 'row' }, [el('b', { text: 'الحصيلة' })]),
    ...tasks.map((task) => el('td.tracker__cell', {}, [
      el('span.tracker__total.tnum', { text: String(doneInMonth.get(task.id)) }),
    ])),
  ]);

  const table = el('div.tracker__scroll', {}, [
    el('table.tracker', {}, [
      el('thead', {}, [
        el('tr', {}, [el('th.tracker__corner', { scope: 'col' }, [icon('event', { size: 15 })]), ...tasks.map(headCell)]),
      ]),
      el('tbody', {}, [...rows, totals]),
    ]),
  ]);

  const main = el('main.main', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
      el('span.pill.pill--sand', {}, [icon('calendar_view_month', { size: 14 }), 'متابعة المهام المتكررة']),
      el('a.pill.pill--soft', { href: '#/home' }, [icon('arrow_forward', { size: 14 }), 'الرئيسية']),
    ]),
    monthBar,
    table,
    el('p.field__hint', {
      style: { lineHeight: '1.9' },
      text: 'اضغط أي خانة لتسجيل الإنجاز أو إلغائه — بما في ذلك أيام مضت، فمن أنجز مهمته ونسي تعليمها يضع العلامة في يومها. والأيام القادمة مقفلة.',
    }),
  ]);

  root.append(appbar(), main, navbar('tracker'));
}
