/**
 * صفحة الحفظ: جدول حفظ القرآن.
 *
 * يختار المستخدم عدد الأوجه في الورد اليومي، فيُقسَّم المصحف كاملاً
 * (٦٠٤ أوجه، ترقيم المصحف المدني) على صفوف، كل صف ورد يوم واحد.
 * وعند حفظ الورد يُعلَّم بعلامة صح زرقاء ويُكتب تاريخ حفظه أسفل الصف.
 */

import { el, icon, toast, confirmSheet } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { currentPlan, planSummary, rowDone, rowDoneAt, rowDoneCount, toggleRow, setPagesPerDay, resetProgress } from '../memorize.js';
import { PAGES_PER_DAY_OPTIONS, PLAN_PAGES } from '../quran.js';
import { taskDateLabel, fromKey, shortDate, weekdayName } from '../datetime.js';

/** تاريخ الحفظ أسفل الصف: 'حُفظ أمس • الأحد، 11 أكتوبر' أو 'حُفظ السبت، 10 أكتوبر'. */
function doneLabel(key) {
  const d = fromKey(key);
  const full = `${weekdayName(d)}، ${shortDate(d)}`;
  const relative = taskDateLabel(key);          // 'اليوم' و'أمس' وما شابه
  return relative === full ? `حُفظ ${full}` : `حُفظ ${relative} • ${full}`;
}

function planRow(row, rerender, isNext) {
  const done = rowDone(row);
  const at = done ? rowDoneAt(row) : null;
  // بعد تغيير حجم الورد قد يحمل الصف أوجهاً محفوظة دون أن يكتمل
  const partial = done ? 0 : rowDoneCount(row);

  const check = el('button.check.check--blue', {
    type: 'button',
    'aria-pressed': done ? 'true' : 'false',
    'aria-label': done ? `إلغاء حفظ: ${row.label}` : `تسجيل حفظ: ${row.label}`,
    onclick: () => {
      const nowDone = toggleRow(row);
      toast(nowDone ? 'سُجّل حفظ الورد' : 'أُلغي تسجيل الحفظ');
      rerender();
    },
  }, [icon('check', { size: 16 })]);

  return el(`li.wird${done ? '.wird--done' : ''}${partial ? '.wird--part' : ''}${isNext ? '.wird--next' : ''}`, {
    'data-start': row.start,
    id: isNext ? 'wird-next' : null,
  }, [
    el('div.wird__main', {}, [
      el('span.wird__num.tnum', { text: String(row.index + 1) }),
      el('div.wird__body', {}, [
        el('div.wird__range', {}, [
          el('span.wird__side', {}, [
            el('b', { text: row.from.split('، ')[0] }),
            el('small.tnum', { text: `وجه ${row.start}` }),
          ]),
          row.start === row.end ? null : icon('arrow_back', { size: 16, cls: 'wird__arrow' }),
          row.start === row.end ? null : el('span.wird__side', {}, [
            el('b', { text: row.to.split('، ')[0] }),
            el('small.tnum', { text: `وجه ${row.end}` }),
          ]),
        ]),
        at ? el('div.wird__at', {}, [icon('event_available', { size: 13 }), doneLabel(at)]) : null,
        partial ? el('div.wird__at.wird__at--part', {}, [
          icon('timelapse', { size: 13 }), `حُفظ ${partial} من ${row.pages.length} أوجه هذا الورد`,
        ]) : null,
      ]),
    ]),
    check,
  ]);
}

export function renderMemorize(root, { rerender }) {
  const plan = currentPlan();
  const s = planSummary(plan);

  /* ----------------------------------------- اختيار حجم الورد اليومي */
  const sizeChips = PAGES_PER_DAY_OPTIONS.map((n) => el('button.chip', {
    type: 'button',
    'aria-pressed': n === s.pagesPerDay ? 'true' : 'false',
    onclick: () => {
      if (n === s.pagesPerDay) return;
      setPagesPerDay(n);
      toast(`الورد اليومي: ${n} ${n === 1 ? 'وجه' : 'أوجه'}`);
      rerender();
    },
  }, [el('span.tnum', { text: String(n) }), n === 1 ? 'وجه' : 'أوجه']));

  const planCard = el('section.card', {}, [
    el('div.field__label', { style: { marginBottom: '.6rem' } }, [
      el('span', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } }, [
        icon('menu_book', { size: 18 }), 'الأوجه في الورد اليومي',
      ]),
      el('span.pill.pill--mint.tnum', { text: `${s.totalRows} يوماً للختمة` }),
    ]),
    el('div.chips', {}, sizeChips),
    el('p.field__hint', {
      style: { marginTop: '.6rem' },
      text: `يبدأ الجدول من بداية سورة البقرة (الوجه ٢) وينتهي بآخر المصحف — ${PLAN_PAGES} وجهاً تُقسَّم على هذا الورد تلقائياً، وتغيير العدد لا يُضيع ما حفظته.`,
    }),
  ]);

  /* ------------------------------------------------- ملخّص التقدّم */
  const progressCard = el('section.card', { 'aria-label': 'تقدّم الحفظ' }, [
    el('div.challenge__top', {}, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '.6rem' } }, [
        el('span.challenge__badge.challenge__badge--blue', {}, [icon('auto_stories', { size: 18 })]),
        el('div', {}, [
          el('div.challenge__title.tnum', { text: `${s.donePages} من ${s.totalPages} وجهاً` }),
          s.nextRow
            ? el('button.challenge__sub.wird__jump', {
              type: 'button',
              onclick: () => document.getElementById('wird-next')
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
            }, [icon('my_location', { size: 13 }), `وردك التالي: ${s.nextRow.label}`])
            : el('div.challenge__sub', { text: 'أتممت المصحف كاملاً — تقبّل الله' }),
        ]),
      ]),
      el('div.challenge__pct.tnum', {}, [`${s.percent}%`, el('small', { text: 'محفوظ' })]),
    ]),
    el('div.track', { role: 'progressbar', 'aria-valuenow': s.percent, 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
      el('div.track__fill.track__fill--blue', { style: { width: `${s.percent}%` } }),
    ]),
    el('p.field__hint', {
      style: { marginTop: '.6rem' },
      text: `أُنجز ${s.doneRows} ورداً، وبقي ${s.remainingRows}.`,
    }),
  ]);

  /* ----------------------------------------------------- جدول الحفظ */
  const table = el('section', {}, [
    el('div.section-head', {}, [
      el('h2.section-head__title', {}, [el('span.dot.dot--blue'), 'جدول الحفظ']),
      el('span.pill.pill--soft.tnum', { text: `${plan.length} ورداً` }),
    ]),
    el('ul.wirdlist', {}, plan.map((row) => planRow(row, rerender, row === s.nextRow))),
  ]);

  const main = el('main.main', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
      el('span.pill.pill--sand', {}, [icon('auto_stories', { size: 14 }), 'ورد الحفظ اليومي']),
      el('button.pill.pill--soft', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'تصفير سجل الحفظ؟',
            desc: 'ستُمسح تواريخ الحفظ لكل الأوجه. الخطة نفسها تبقى كما هي.',
            confirmText: 'تصفير',
            danger: true,
          });
          if (ok) { resetProgress(); toast('صُفّر سجل الحفظ'); rerender(); }
        },
      }, [icon('restart_alt', { size: 14 }), 'تصفير']),
    ]),
    planCard,
    progressCard,
    table,
  ]);

  root.append(appbar(), main, navbar('memorize'));
}
