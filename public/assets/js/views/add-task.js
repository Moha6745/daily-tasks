/**
 * صفحة إضافة مهمة:
 *  — حقل اسم المهمة، وتحته تاريخ المهمة افتراضياً اليوم وقابل للتعديل.
 *  — خيار "متكررة يومياً" يجعل المهمة تظهر تلقائياً كل يوم.
 *  — وقت تذكير اختياري.
 */

import { el, icon, toast } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { addTask, DEFAULT_CATEGORY, bucketOf } from '../tasks.js';
import { todayKey, fromKey, shortDate, weekdayName, taskDateLabel } from '../datetime.js';

const BUCKET_LABEL = {
  daily: 'ستُضاف إلى خانة «المهام اليومية»',
  weekly: 'ستُضاف إلى خانة «المهام الأسبوعية»',
  monthly: 'ستُضاف إلى خانة «المهام الشهرية»',
};

export function renderAddTask(root, { rerender, navigate }) {
  const today = todayKey();

  const form = {
    title: '',
    date: today,
    repeatDaily: false,
    category: DEFAULT_CATEGORY,
    reminder: '',
  };

  /* ------------------------------------------------- حقل اسم المهمة */
  const titleInput = el('input.input', {
    type: 'text',
    placeholder: 'مثال: قراءة جزء من القرآن، صلاة الوتر…',
    'aria-label': 'اسم المهمة أو العادة',
    maxlength: '200',
    required: true,
    autocomplete: 'off',
    oninput: (e) => { form.title = e.target.value; refreshSubmit(); },
  });

  /* ---------------------------------- تاريخ المهمة (افتراضياً اليوم) */
  const dateInput = el('input.input', {
    type: 'date',
    value: today,
    min: '2000-01-01',
    'aria-label': 'تاريخ المهمة',
    onchange: (e) => {
      if (!e.target.value) e.target.value = form.date;      // لا نسمح بتاريخ فارغ
      else form.date = e.target.value;
      syncDateNote();
    },
  });

  const dateNote = el('p.field__hint', { style: { marginTop: '.1rem' } });

  function syncDateNote() {
    if (form.repeatDaily) {
      dateNote.textContent = 'المهام المتكررة تظهر دائماً ضمن خانة «المهام اليومية»';
      return;
    }
    const probe = { date: form.date, repeatDaily: false, done: false, completions: {} };
    const d = fromKey(form.date);
    dateNote.textContent = `${taskDateLabel(form.date)} (${weekdayName(d)}، ${shortDate(d)}) — ${BUCKET_LABEL[bucketOf(probe, today)]}`;
  }

  /* ------------------------------------------------------- التكرار */
  const repeatSwitch = el('button.switch', {
    type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'تكرار المهمة يومياً',
    onclick: (e) => {
      form.repeatDaily = e.currentTarget.getAttribute('aria-checked') !== 'true';
      e.currentTarget.setAttribute('aria-checked', form.repeatDaily ? 'true' : 'false');
      // المتكررة تبدأ من اليوم دائماً، فلا معنى لتاريخ آخر
      if (form.repeatDaily) { form.date = today; dateInput.value = today; }
      dateInput.disabled = form.repeatDaily;
      repeatNote.hidden = !form.repeatDaily;
      syncDateNote();
    },
  });

  const repeatNote = el('p', {
    hidden: true,
    style: {
      marginTop: '.6rem', padding: '.7rem .85rem', borderRadius: 'var(--r)',
      background: 'var(--primary-fixed)', color: 'var(--on-primary-fixed-variant)',
      fontSize: '12px', lineHeight: '1.8',
    },
    text: 'ستظهر هذه المهمة تلقائياً كل صباح في قائمة مهامك اليومية، ويُحتسب إنجازها لكل يوم على حدة ضمن تحدي الـ 30.',
  });

  /* ------------------------------------------------------- التذكير */
  const reminderInput = el('input.input', {
    type: 'time',
    'aria-label': 'وقت التذكير',
    style: { maxWidth: '11rem' },
    oninput: (e) => { form.reminder = e.target.value; },
  });

  /* --------------------------------------------------------- الحفظ */
  const submitBtn = el('button.btn.btn--primary.btn--block.btn--lg', {
    type: 'submit', disabled: true,
  }, [icon('task_alt', { size: 20 }), 'حفظ المهمة ومتابعة التحدي']);

  function refreshSubmit() {
    submitBtn.disabled = !form.title.trim();
  }

  const formEl = el('form', {
    style: { display: 'flex', flexDirection: 'column', gap: 'var(--md)' },
    onsubmit: (e) => {
      e.preventDefault();
      const created = addTask(form);
      if (!created) { toast('اكتب اسم المهمة أولاً'); return; }
      const bucket = bucketOf(created, today);
      toast({
        daily: 'أُضيفت إلى المهام اليومية',
        weekly: 'أُضيفت إلى المهام الأسبوعية',
        monthly: 'أُضيفت إلى المهام الشهرية',
      }[bucket]);
      navigate('#/home');
    },
  }, [
    /* نية اليوم */
    el('div.card', { style: { display: 'flex', alignItems: 'center', gap: '.85rem' } }, [
      el('span.permcard__glyph.permcard__glyph--mint', {}, [icon('spa', { size: 22 })]),
      el('div', {}, [
        el('div.permcard__title', { text: 'نيّة صالحة وعمل مستمر' }),
        el('div.permcard__desc', { text: '«أحبُّ الأعمالِ إلى اللهِ أدومُها وإن قلّ»' }),
      ]),
    ]),

    /* اسم المهمة + تاريخها */
    el('div.card', {}, [
      el('div.field', {}, [
        el('label.field__label', {}, [
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } }, [
            icon('edit_note', { size: 18 }), 'ما هي المهمة أو العادة التي تريد إنجازها؟',
          ]),
          el('span.field__hint', { text: 'مطلوب' }),
        ]),
        titleInput,
      ]),
      el('div.field', { style: { marginTop: '.85rem' } }, [
        el('label.field__label', {}, [
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } }, [
            icon('calendar_month', { size: 18 }), 'تاريخ المهمة',
          ]),
          el('span.field__hint', { text: 'افتراضياً اليوم' }),
        ]),
        dateInput,
        dateNote,
      ]),
    ]),

    /* التكرار */
    el('div.card', {}, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '.85rem' } }, [
        el('span.permcard__glyph.permcard__glyph--sand', {}, [icon('repeat', { size: 22 })]),
        el('div', { style: { flex: '1' } }, [
          el('div.permcard__title', { text: 'تكرار المهمة تلقائياً كل يوم' }),
          el('div.permcard__desc', { text: 'ضمن تحدي الـ 30 يوماً' }),
        ]),
        repeatSwitch,
      ]),
      repeatNote,
    ]),

    /* التذكير */
    el('div.card', {}, [
      el('div.field__label', { style: { marginBottom: '.6rem' } }, [
        el('span', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } }, [
          icon('alarm', { size: 18 }), 'وقت التذكير بالمنبّه',
        ]),
        el('span.field__hint', { text: 'اختياري' }),
      ]),
      reminderInput,
      el('p.field__hint', { style: { marginTop: '.5rem' }, text: 'يعمل التذكير ما دام التطبيق مفتوحاً، ويتطلّب تفعيل الإشعارات من الإعدادات.' }),
    ]),

    submitBtn,
    el('a', {
      href: '#/home',
      style: { textAlign: 'center', fontSize: '12px', color: 'var(--on-surface-variant)' },
      text: 'إلغاء والعودة للقائمة الرئيسية',
    }),
  ]);

  const main = el('main.main', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
      el('span.pill.pill--sand', {}, [icon('auto_awesome', { size: 14 }), 'خطوة جديدة نحو الاستقامة']),
      el('a.pill.pill--soft', { href: '#/home' }, [icon('close', { size: 14 }), 'إلغاء']),
    ]),
    formEl,
  ]);

  root.append(appbar(), main, navbar('add'));
  syncDateNote();
  titleInput.focus();
}
