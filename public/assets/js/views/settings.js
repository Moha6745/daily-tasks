/** صفحة الإعدادات: الحساب، الموقع، الإشعارات، خطة الحفظ، التحدي، المظهر. */

import { el, icon, toast, toggle, confirmSheet, sheet } from '../ui.js';
import { appbar, navbar } from './chrome.js';
import { getState, update, resetAll } from '../store.js';
import { signOut, providerLabel, signInWithSyncKey, changePassword } from '../auth.js';
import {
  syncStatus, syncNow, probeServer, generateSyncKey, formatSyncKey, endSession,
} from '../sync.js';
import { requestLocation, setCity, CITIES, activeCoords } from '../location.js';
import {
  requestPermission as requestNotifications, permission as notifPermission,
  supported as notifSupported, schedule, sendTest,
} from '../notifications.js';
import { METHODS, ASR_METHODS } from '../prayer.js';
import { challengeSummary, startNewChallenge } from '../tasks.js';
import { memorizeState, setPagesPerDay, currentPlan, planSummary } from '../memorize.js';
import { PAGES_PER_DAY_OPTIONS, PLAN_PAGES } from '../quran.js';
import { applyTheme } from '../theme.js';
import { APP_INFO } from '../config.js';

function sectionTitle(text, glyph) {
  return el('div.section-head', {}, [
    el('h2.section-head__title', {}, [icon(glyph, { size: 20 }), text]),
  ]);
}

function row({ glyph, glyphClass = '', title, desc, control, extra }) {
  return el('div.settingrow', {}, [
    el(`span.settingrow__glyph ${glyphClass}`.trim(), {}, [icon(glyph, { size: 20 })]),
    el('div.settingrow__body', {}, [
      el('div.settingrow__title', { text: title }),
      desc ? el('div.settingrow__desc', { text: desc }) : null,
      extra ? el('div.settingrow__extra', {}, [].concat(extra)) : null,
    ]),
    control || null,
  ]);
}

function timeInput(value, onChange, label) {
  return el('input.input', {
    type: 'time',
    value,
    'aria-label': label,
    style: { maxWidth: '8.5rem', padding: '.45rem .65rem', fontSize: '13px' },
    onchange: (e) => onChange(e.target.value),
  });
}

function selectField(value, options, onChange, label) {
  return el('div.selectwrap', { style: { flex: '1', minWidth: '12rem' } }, [
    el('select.select', {
      'aria-label': label,
      style: { padding: '.5rem .7rem', fontSize: '13px' },
      onchange: (e) => onChange(e.target.value),
    }, options.map(([val, text]) => el('option', { value: val, text, selected: val === value ? true : null }))),
    icon('expand_more'),
  ]);
}

export function renderSettings(root, { rerender, navigate }) {
  const state = getState();
  const { settings, user } = state;
  const coords = activeCoords();
  const summary = challengeSummary();

  /* ------------------------------------------------------- الحساب */

  /** يعرض رمزاً سرّياً مرة واحدة للنسخ — رمز استرجاع أو مفتاح مزامنة. */
  const secretSheet = ({ title, desc, code }) => sheet({
    title,
    desc,
    content: (close) => {
      const input = el('input.input.tnum', {
        readonly: true, value: formatSyncKey(code), 'aria-label': title,
        style: { textAlign: 'center', letterSpacing: '.06em', fontSize: '15px' },
      });
      return el('div', {}, [
        input,
        el('button.btn.btn--tonal.btn--block', {
          type: 'button',
          style: { marginTop: '.6rem' },
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(formatSyncKey(code));
              toast('نُسخ');
            } catch {
              input.select();
              toast('انسخه يدوياً');
            }
          },
        }, [icon('content_copy', { size: 18 }), 'نسخ']),
        el('button.btn.btn--primary.btn--block', {
          type: 'button', style: { marginTop: '.5rem' }, onclick: close,
        }, [icon('check', { size: 18 }), 'حفظته']),
      ]);
    },
  });

  /**
   * تغيير كلمة السرّ. الرمز يُستبدل مع كلمة السرّ لأن الاثنين طريقان إلى
   * الحساب نفسه: من بدّل أحدهما لأنه انكشف يجب أن يبدّل الآخر معه.
   */
  const changePasswordSheet = () => sheet({
    title: 'تغيير كلمة السرّ',
    desc: 'أدخل كلمة السرّ الحالية ثم الجديدة. سيظهر بعدها رمز استرجاع جديد يُبطل القديم.',
    content: (close) => {
      const current = el('input.input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••••', 'aria-label': 'كلمة السرّ الحالية' });
      const next = el('input.input', { type: 'password', autocomplete: 'new-password', placeholder: '••••••••••', 'aria-label': 'كلمة السرّ الجديدة' });
      const again = el('input.input', { type: 'password', autocomplete: 'new-password', placeholder: '••••••••••', 'aria-label': 'تأكيد كلمة السرّ الجديدة' });

      const go = el('button.btn.btn--primary.btn--block', {
        type: 'button',
        style: { marginTop: '.7rem' },
        onclick: async () => {
          if (next.value !== again.value) { toast('كلمتا السرّ غير متطابقتين'); return; }
          go.disabled = true;
          go.lastChild.textContent = 'جارٍ التغيير…';
          try {
            const res = await changePassword({ current: current.value, next: next.value });
            close();
            secretSheet({
              title: 'رمز استرجاع جديد',
              desc: 'تغيّرت كلمة السرّ. هذا رمز الاسترجاع الجديد — احفظه، فالقديم لم يبق صالحاً.',
              code: res.recovery,
            });
          } catch (err) {
            toast(err.message || 'تعذّر التغيير');
            go.disabled = false;
            go.lastChild.textContent = 'تغيير كلمة السرّ';
          }
        },
      }, [icon('lock_reset', { size: 18 }), 'تغيير كلمة السرّ']);

      const labeled = (text, input) => el('label.field', {}, [el('span.field__label', { text }), input]);

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.7rem' } }, [
        labeled('كلمة السرّ الحالية', current),
        labeled('كلمة السرّ الجديدة', next),
        labeled('تأكيد الجديدة', again),
        go,
      ]);
    },
  });

  const accountCard = el('section.card', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '.85rem' } }, [
      user?.picture
        ? el('span.avatar', { style: { width: '3.25rem', height: '3.25rem' } }, [el('img', { src: user.picture, alt: '', referrerpolicy: 'no-referrer' })])
        : el('span.avatar', { style: { width: '3.25rem', height: '3.25rem', fontSize: '20px' }, text: (user?.name || 'ض').charAt(0) }),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' } }, [
          el('span', { style: { fontSize: '17px', fontWeight: '700' }, text: user?.name || 'ضيف' }),
          el('span.pill.pill--sand', { text: 'نخبة الملتزمين' }),
        ]),
        el('div.settingrow__desc', { text: user?.email || coords.label || '' }),
      ]),
    ]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.85rem' } }, [
      el('div', { style: { background: 'var(--surface-low)', borderRadius: 'var(--r)', padding: '.7rem' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          el('span.settingrow__desc', { text: 'مسار التحدي' }),
          icon('calendar_month', { size: 16 }),
        ]),
        el('div', { style: { fontSize: '20px', fontWeight: '800' }, class: 'tnum', text: `${summary.dayNumber} / ${summary.length} يوماً` }),
      ]),
      el('div', { style: { background: 'var(--surface-low)', borderRadius: 'var(--r)', padding: '.7rem' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          el('span.settingrow__desc', { text: 'نسبة الالتزام' }),
          icon('verified', { size: 16 }),
        ]),
        el('div', { style: { fontSize: '20px', fontWeight: '800' }, class: 'tnum', text: `${summary.percent}%` }),
      ]),
    ]),
    el('div.track', {}, [el('div.track__fill', { style: { width: `${Math.round((summary.dayNumber / summary.length) * 100)}%` } })]),
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' } }, [
      el('span.settingrow__desc', { text: providerLabel(user?.provider) }),
      el('button.btn.btn--ghost', {
        type: 'button',
        style: { padding: '.4rem .9rem', fontSize: '12px' },
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'تسجيل الخروج؟',
            desc: 'تبقى مهامك محفوظة على هذا الجهاز وتعود إليها عند الدخول مرة أخرى.',
            confirmText: 'خروج',
          });
          if (ok) { signOut(); navigate('#/login'); }
        },
      }, ['تسجيل الخروج', icon('logout', { size: 16 })]),
    ]),

    user?.provider === 'password'
      ? row({
        glyph: 'password',
        title: 'تغيير كلمة السرّ',
        desc: 'تحتاج كلمة السرّ الحالية. الأجهزة الأخرى تبقى داخلة بجلساتها حتى تُخرجها منها بنفسك.',
        control: el('button.btn.btn--tonal', {
          type: 'button',
          style: { padding: '.45rem 1rem', fontSize: '12px' },
          onclick: changePasswordSheet,
        }, [icon('lock_reset', { size: 16 }), 'تغيير']),
      })
      : null,
  ]);

  /* ------------------------------------------- الموقع الجغرافي والقبلة */
  const locationCard = el('section.card', {}, [
    row({
      glyph: 'near_me',
      glyphClass: 'settingrow__glyph--mint',
      title: 'تحديد الموقع التلقائي',
      desc: 'يُستخدم لضبط التوقيت المحلي بدقة متناهية وحساب مواقيت الصلاة وبوصلة القبلة.',
      control: toggle(Boolean(settings.locationEnabled), async (next, btn) => {
        if (!next) {
          update({ settings: { locationEnabled: false } });
          toast('أُوقف التحديد التلقائي — ستُستخدم المدينة المختارة');
          return;
        }
        try {
          const c = await requestLocation();
          toast(`حُدّد موقعك: ${c.label}`);
          rerender();
        } catch (err) {
          btn.setAttribute('aria-checked', 'false');
          toast(err.message);
        }
      }, 'تحديد الموقع التلقائي'),
      extra: [
        el('span.pill.pill--soft', {}, [
          icon('location_on', { size: 14 }),
          `${coords.label} (${coords.lat.toFixed(4)}، ${coords.lon.toFixed(4)})`,
        ]),
        el('span.pill.pill--mint', { text: settings.locationEnabled ? 'GPS نشط' : 'مدينة محدّدة يدوياً' }),
        el('button.btn.btn--ghost', {
          type: 'button',
          style: { padding: '.3rem .8rem', fontSize: '11px' },
          onclick: () => sheet({
            title: 'تغيير المدينة',
            desc: 'اختر مدينتك لحساب المواقيت دون مشاركة موقعك.',
            content: (close) => el('div.chips', { style: { maxHeight: '45dvh', overflowY: 'auto' } },
              CITIES.map((c) => el('button.chip', {
                type: 'button',
                text: c.label,
                'aria-pressed': coords.label === c.label ? 'true' : 'false',
                onclick: () => { setCity(c.label); close(); toast(`المدينة: ${c.label}`); rerender(); },
              }))),
          }),
        }, ['تغيير المدينة', icon('chevron_left', { size: 14 })]),
      ],
    }),
    row({
      glyph: 'calculate',
      title: 'طريقة حساب المواقيت',
      desc: 'اختر الطريقة المعتمدة في بلدك لضبط زاويتي الفجر والعشاء.',
      extra: [
        selectField(settings.calcMethod, Object.entries(METHODS).map(([k, v]) => [k, v.name]),
          (v) => { update({ settings: { calcMethod: v } }); schedule(); toast('حُدّثت طريقة الحساب'); rerender(); },
          'طريقة حساب المواقيت'),
      ],
    }),
    row({
      glyph: 'wb_shade',
      title: 'مذهب حساب العصر',
      desc: 'الجمهور: ظل المثل. الحنفي: ظل المثلين.',
      extra: [
        selectField(settings.asrMethod, Object.entries(ASR_METHODS).map(([k, v]) => [k, v.name]),
          (v) => { update({ settings: { asrMethod: v } }); schedule(); rerender(); },
          'مذهب حساب العصر'),
      ],
    }),
  ]);

  /* -------------------------------------------------------- الإشعارات */
  const notifState = notifPermission();
  const notifBlocked = notifState === 'denied';

  const notificationsCard = el('section.card', {}, [
    row({
      glyph: 'notifications',
      glyphClass: 'settingrow__glyph--mint',
      title: 'السماح بالإشعارات والتذكيرات',
      desc: notifBlocked
        ? 'الإشعارات محظورة من إعدادات المتصفح لهذا الموقع. فعّلها من إعدادات الموقع ثم أعد المحاولة.'
        : 'تشغيل كل التنبيهات الموقّتة في اليوم.',
      control: toggle(Boolean(settings.notificationsEnabled) && notifState === 'granted', async (next, btn) => {
        if (!next) {
          update({ settings: { notificationsEnabled: false } });
          schedule();
          toast('أُوقفت التنبيهات');
          return;
        }
        if (!notifSupported()) { btn.setAttribute('aria-checked', 'false'); toast('المتصفح لا يدعم الإشعارات'); return; }
        const granted = await requestNotifications();
        if (!granted) { btn.setAttribute('aria-checked', 'false'); toast('لم يُمنح إذن الإشعارات'); return; }
        toast('فُعّلت التنبيهات');
        rerender();
      }, 'السماح بالإشعارات'),
      extra: settings.notificationsEnabled && notifState === 'granted'
        ? [el('button.btn.btn--ghost', {
          type: 'button',
          style: { padding: '.3rem .8rem', fontSize: '11px' },
          onclick: () => { sendTest(); toast('أُرسل إشعار تجريبي'); },
        }, [icon('send', { size: 14 }), 'إرسال إشعار تجريبي'])]
        : null,
    }),
    row({
      glyph: 'wb_twilight',
      glyphClass: 'settingrow__glyph--sand',
      title: 'تذكير الفجر وبداية اليوم',
      desc: 'تذكير بمهام بداية اليوم واستحضار النية الصالحة.',
      control: toggle(Boolean(settings.fajrReminder), (next) => {
        update({ settings: { fajrReminder: next } });
        schedule();
      }, 'تذكير بداية اليوم'),
      extra: [
        el('span.settingrow__desc', { text: 'وقت التنبيه:' }),
        timeInput(settings.fajrReminderTime, (v) => { update({ settings: { fajrReminderTime: v } }); schedule(); }, 'وقت تذكير الفجر'),
      ],
    }),
    row({
      glyph: 'nights_stay',
      title: 'تذكير المساء وحصاد اليوم',
      desc: 'مراجعة إنجاز مهام اليوم وشطب ما تمّ إتمامه قبل انتهاء اليوم.',
      control: toggle(Boolean(settings.nightReminder), (next) => {
        update({ settings: { nightReminder: next } });
        schedule();
      }, 'تذكير نهاية اليوم'),
      extra: [
        el('span.settingrow__desc', { text: 'وقت التنبيه:' }),
        timeInput(settings.nightReminderTime, (v) => { update({ settings: { nightReminderTime: v } }); schedule(); }, 'وقت تذكير المساء'),
      ],
    }),
    row({
      glyph: 'mosque',
      title: 'تنبيهات مواقيت الصلوات الخمس',
      desc: 'تنبيه قبل الأذان بمدة تختارها.',
      control: toggle(Boolean(settings.prayerAlerts), (next) => {
        update({ settings: { prayerAlerts: next } });
        schedule();
      }, 'تنبيهات مواقيت الصلاة'),
      extra: [
        selectField(String(settings.prayerAlertLead),
          [['0', 'عند الأذان مباشرة'], ['5', 'قبل 5 دقائق'], ['10', 'قبل 10 دقائق'], ['15', 'قبل 15 دقيقة'], ['30', 'قبل 30 دقيقة']],
          (v) => { update({ settings: { prayerAlertLead: Number(v) } }); schedule(); },
          'مدة التنبيه قبل الأذان'),
      ],
    }),
    el('p.field__hint', { style: { marginTop: '.6rem', lineHeight: '1.9' },
      text: 'تعمل التنبيهات ما دام التطبيق مفتوحاً في المتصفح (ولو في الخلفية). لتصل وهو مغلق، ثبّت التطبيق على الشاشة الرئيسية.' }),
  ]);

  /* ------------------------------------------------------ خطة الحفظ */
  const wird = planSummary(currentPlan());

  const memorizeCard = el('section.card', {}, [
    row({
      glyph: 'menu_book',
      glyphClass: 'settingrow__glyph--mint',
      title: 'ورد الحفظ اليومي',
      desc: `عدد الأوجه التي تحفظها كل يوم. يُعاد تقسيم الجدول (${PLAN_PAGES} وجهاً من البقرة إلى الناس) على الورد الجديد تلقائياً، وما حُفظ يبقى محفوظاً.`,
      extra: el('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' } }, [
        el('span.settingrow__desc', { text: 'الأوجه:' }),
        selectField(
          String(memorizeState().pagesPerDay),
          PAGES_PER_DAY_OPTIONS.map((n) => [String(n), `${n} ${n === 1 ? 'وجه' : 'أوجه'} يومياً`]),
          (value) => {
            setPagesPerDay(value);
            toast('حُدّثت خطة الحفظ');
            rerender();
          },
          'عدد أوجه الورد اليومي',
        ),
      ]),
    }),
    row({
      glyph: 'auto_stories',
      title: 'تقدّمك في الحفظ',
      desc: `حفظت ${wird.donePages} من ${PLAN_PAGES} وجهاً (${wird.percent}%)، والخطة الحالية ${wird.totalRows} ورداً وبقي منها ${wird.remainingRows}.`,
      control: el('a.btn.btn--tonal', {
        href: '#/memorize',
        style: { padding: '.45rem 1rem', fontSize: '12px' },
      }, [icon('table_rows', { size: 16 }), 'الجدول']),
    }),
  ]);

  /* ---------------------------------------------------- إدارة التحدي */
  const challengeCard = el('section.card', {}, [
    row({
      glyph: 'flag',
      glyphClass: 'settingrow__glyph--mint',
      title: 'بدء دورة تحدٍّ جديدة',
      desc: 'إعادة تعيين العدّاد إلى اليوم الأول واختيار باقة عادات جديدة، مع الاحتفاظ بمهامك الحالية.',
      control: el('button.btn.btn--tonal', {
        type: 'button',
        style: { padding: '.45rem 1rem', fontSize: '12px' },
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'بدء دورة جديدة؟',
            desc: 'سيعود عدّاد التحدي إلى اليوم الأول. مهامك وسجل إنجازها تبقى كما هي.',
            confirmText: 'ابدأ من جديد',
          });
          if (ok) { startNewChallenge(); toast('بدأت دورة تحدٍّ جديدة'); rerender(); }
        },
      }, 'دورة جديدة'),
    }),
    row({
      glyph: 'download',
      title: 'تصدير بياناتي',
      desc: 'تنزيل نسخة من مهامك وإعداداتك وسجل إنجازك بصيغة JSON.',
      control: el('button.btn.btn--primary', {
        type: 'button',
        style: { padding: '.45rem 1rem', fontSize: '12px' },
        onclick: () => exportData(),
      }, [icon('download', { size: 16 }), 'تصدير']),
    }),
  ]);

  /* ------------------------------------------------------- المزامنة */
  const sync = syncStatus();

  const STATUS_TEXT = {
    off: 'متوقّفة على هذا الجهاز',
    idle: 'جاهزة',
    syncing: 'تجري المزامنة الآن…',
    ok: 'محدّثة',
    error: 'تعذّرت آخر محاولة',
    offline: 'بلا اتصال — ستُزامن عند عودة الشبكة',
    unavailable: 'الخادم غير مُعدّ للمزامنة بعد',
    expired: 'انتهت الجلسة — أعد تسجيل الدخول',
  };

  const relative = (at) => {
    if (!at) return 'لم تحدث بعد';
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return 'قبل لحظات';
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;
    return `قبل ${Math.round(hours / 24)} يوم`;
  };

  /** يعرض مفتاح المزامنة لنقله إلى جهاز آخر. */
  const showKey = (key) => sheet({
    title: 'مفتاح المزامنة',
    desc: 'أدخل هذا المفتاح في التطبيق على جهازك الآخر لتلتقي الأجهزة على بيانات واحدة.',
    content: () => el('div', {}, [
      el('input.input.tnum', {
        readonly: true, value: formatSyncKey(key), 'aria-label': 'مفتاح المزامنة',
        style: { textAlign: 'center', letterSpacing: '.06em', fontSize: '15px' },
      }),
      el('button.btn.btn--tonal.btn--block', {
        type: 'button',
        style: { marginTop: '.6rem' },
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(formatSyncKey(key));
            toast('نُسخ المفتاح');
          } catch {
            toast('انسخ المفتاح يدوياً');
          }
        },
      }, [icon('content_copy', { size: 18 }), 'نسخ']),
      el('p.field__hint', {
        style: { lineHeight: '1.9', marginTop: '.6rem' },
        text: 'من يملك هذا المفتاح يصل إلى بياناتك. لا تشاركه إلا مع أجهزتك.',
      }),
    ]),
  });

  /** تشغيل المزامنة من الإعدادات لمن دخل كضيف. */
  const connectSheet = () => sheet({
    title: 'تشغيل المزامنة',
    desc: 'أنشئ مفتاحاً جديداً لهذا الجهاز، أو أدخل مفتاح جهاز آخر لتلتقي بياناتك.',
    content: (close) => {
      const input = el('input.input.tnum', {
        placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
        'aria-label': 'مفتاح المزامنة',
        autocapitalize: 'characters',
        spellcheck: 'false',
        style: { textAlign: 'center', letterSpacing: '.06em' },
      });
      const run = async (key, btn) => {
        btn.disabled = true;
        try {
          await signInWithSyncKey(key);
          close();
          toast('بدأت المزامنة');
          rerender();
        } catch (err) {
          toast(err.message || 'تعذّر الاتصال');
          btn.disabled = false;
        }
      };
      const makeBtn = el('button.btn.btn--primary.btn--block', {
        type: 'button',
        onclick: () => {
          const key = generateSyncKey();
          close();
          showKey(key);
          run(key, makeBtn).catch(() => {});
        },
      }, [icon('add', { size: 18 }), 'إنشاء مفتاح جديد']);
      const joinBtn = el('button.btn.btn--tonal.btn--block', {
        type: 'button', style: { marginTop: '.6rem' },
        onclick: () => run(input.value, joinBtn),
      }, [icon('login', { size: 18 }), 'اتصال بهذا المفتاح']);

      return el('div', {}, [
        makeBtn,
        el('div.divider', { text: 'أو' }),
        input,
        joinBtn,
      ]);
    },
  });

  const syncCard = el('section.card', {}, [
    row({
      glyph: 'cloud_sync',
      glyphClass: sync.active ? 'settingrow__glyph--mint' : '',
      title: sync.active ? 'المزامنة بين أجهزتك مفعّلة' : 'المزامنة بين أجهزتك متوقّفة',
      desc: sync.active
        ? `${STATUS_TEXT[sync.status] || sync.status} • آخر مزامنة: ${relative(sync.lastSyncAt)}${sync.pending ? ' • هناك تغييرات لم تُرسل' : ''}`
        : 'مهامك الآن على هذا الجهاز وحده. شغّل المزامنة لتصل إلى جوالك وحاسوبك معاً.',
      control: sync.active
        ? el('button.btn.btn--tonal', {
          type: 'button',
          style: { padding: '.45rem 1rem', fontSize: '12px' },
          onclick: async (e) => {
            e.target.disabled = true;
            const res = await syncNow({ force: true });
            toast(res?.ok ? (res.changed ? `وصلت ${res.changed} تحديثات` : 'كل شيء محدّث') : (res?.error || 'تعذّرت المزامنة'));
            rerender();
          },
        }, [icon('sync', { size: 16 }), 'زامن الآن'])
        : el('button.btn.btn--primary', {
          type: 'button',
          style: { padding: '.45rem 1rem', fontSize: '12px' },
          onclick: connectSheet,
        }, [icon('cloud_sync', { size: 16 }), 'تشغيل']),
      extra: sync.lastError && sync.status !== 'ok'
        ? [el('span.settingrow__desc', { style: { color: 'var(--error)' }, text: sync.lastError })]
        : null,
    }),

    sync.active && getState().sync?.key
      ? row({
        glyph: 'key',
        title: 'مفتاح هذا الحساب',
        desc: 'أدخله في أجهزتك الأخرى لتنضمّ إلى البيانات نفسها.',
        control: el('button.btn.btn--tonal', {
          type: 'button',
          style: { padding: '.45rem 1rem', fontSize: '12px' },
          onclick: () => showKey(getState().sync.key),
        }, [icon('visibility', { size: 16 }), 'إظهار']),
      })
      : null,

    sync.active
      ? row({
        glyph: 'link_off',
        title: 'إيقاف المزامنة على هذا الجهاز',
        desc: 'تبقى بياناتك هنا كما هي، وتبقى نسخة الخادم سليمة لبقية أجهزتك.',
        control: el('button.btn.btn--ghost', {
          type: 'button',
          style: { padding: '.45rem 1rem', fontSize: '12px' },
          onclick: async () => {
            const ok = await confirmSheet({
              title: 'إيقاف المزامنة؟',
              desc: 'سيتوقّف هذا الجهاز عن الإرسال والاستقبال. يمكنك تشغيلها مرة أخرى بالمفتاح نفسه.',
              confirmText: 'أوقف',
            });
            if (ok) { endSession(); toast('أُوقفت المزامنة'); rerender(); }
          },
        }, 'إيقاف'),
      })
      : null,

    row({
      glyph: 'troubleshoot',
      title: 'تشخيص الخادم',
      desc: 'يسأل الخادم عمّا هو مُعدّ فعلاً: القاعدة والأسرار ومقدِّمو الدخول.',
      control: el('button.btn.btn--ghost', {
        type: 'button',
        style: { padding: '.45rem 1rem', fontSize: '12px' },
        onclick: async () => {
          const info = await probeServer();
          sheet({
            title: 'حالة خادم المزامنة',
            desc: info.reachable ? (info.ready ? 'الخادم جاهز للمزامنة.' : 'الخادم يستجيب لكن إعداده غير مكتمل.') : 'لا يمكن الوصول إلى الخادم من هذا الجهاز.',
            content: () => el('div', { style: { display: 'grid', gap: '.35rem' } },
              Object.entries({
                'الاتصال بالخادم': info.reachable,
                'قاعدة البيانات D1': info.checks?.database,
                'سرّ الجلسات': info.checks?.sessionSecret,
                'فلفل كلمات السرّ والمفاتيح': info.checks?.keyPepper,
              }).map(([label, ok]) => el('div', {
                style: { display: 'flex', justifyContent: 'space-between', gap: '.5rem', fontSize: '13px' },
              }, [
                el('span', { text: label }),
                el('span', { style: { color: ok ? 'var(--primary)' : 'var(--error)' }, text: ok ? 'جاهز' : 'غير مضبوط' }),
              ]))),
          });
        },
      }, 'فحص'),
    }),
  ]);

  /* ------------------------------------------------ المظهر والتفضيلات */
  const themeCard = el('section.card', {}, [
    row({
      glyph: 'dark_mode',
      title: 'المظهر الداكن (الوضع الليلي)',
      desc: 'الراحة البصرية للقراءة في الظلام.',
      control: toggle(settings.theme === 'dark', (next) => {
        const theme = next ? 'dark' : 'light';
        update({ settings: { theme } });
        applyTheme(theme);
      }, 'الوضع الداكن'),
      extra: [
        el('span.settingrow__desc', { text: 'الوضع:' }),
        selectField(settings.theme,
          [['system', 'تلقائي — حسب إعدادات الجهاز'], ['light', 'فاتح دائماً'], ['dark', 'داكن دائماً']],
          (v) => { update({ settings: { theme: v } }); applyTheme(v); rerender(); },
          'وضع المظهر'),
      ],
    }),
  ]);

  /* ------------------------------------------------- الدعم والمعلومات */
  const aboutCard = el('section.card', {}, [
    el('button.linkrow', {
      type: 'button',
      onclick: () => sheet({
        title: 'الخصوصية وحماية البيانات',
        content: () => el('p', {
          style: { fontSize: '13px', lineHeight: '2' },
          text: 'يعمل هذا التطبيق بالكامل داخل متصفحك. مهامك وإعداداتك وموقعك تُحفظ في ذاكرة المتصفح المحلية فقط، ولا تُرسل إلى أي خادم. حساب مواقيت الصلاة واتجاه القبلة يتم محلياً على جهازك دون اتصال بالإنترنت. لحذف كل شيء استخدم زر «حذف جميع البيانات».',
        }),
      }),
    }, [
      el('span.linkrow__start', {}, [icon('shield', { size: 20 }), 'سياسة الخصوصية وحماية البيانات']),
      icon('chevron_left', { size: 20 }),
    ]),
    el('button.linkrow', {
      type: 'button',
      onclick: () => sheet({
        title: 'كيف تُصنَّف المهام؟',
        content: () => el('div', { style: { fontSize: '13px', lineHeight: '2' } }, [
          el('p', { text: '• المهام اليومية: ما تاريخه اليوم، إضافة إلى المتكررة كل يوم، والمتكررة أسبوعياً إن وافق يومها، والمهام المتأخرة.' }),
          el('p', { text: '• المهام الأسبوعية: من الغد وحتى يوم السبت من الأسبوع نفسه، ويظهر تاريخ كل مهمة بجانبها.' }),
          el('p', { text: '• المهام الشهرية: كل ما جاء بعد سبت هذا الأسبوع.' }),
          el('p', { style: { marginTop: '.6rem' }, text: 'عند إتمام المهمة تُشطب بخط وتنزل تلقائياً إلى أسفل القائمة.' }),
        ]),
      }),
    }, [
      el('span.linkrow__start', {}, [icon('help', { size: 20 }), 'الأسئلة الشائعة ودليل الاستخدام']),
      icon('chevron_left', { size: 20 }),
    ]),
    el('button.linkrow', {
      type: 'button',
      style: { color: 'var(--error)' },
      onclick: async () => {
        const ok = await confirmSheet({
          title: 'حذف جميع البيانات؟',
          desc: 'ستُحذف كل مهامك وإعداداتك وسجل التحدي من هذا الجهاز نهائياً، وتتوقّف المزامنة عليه. نسخة الخادم تبقى، فالدخول بالمفتاح نفسه يعيد بياناتك.',
          confirmText: 'حذف كل شيء',
          danger: true,
        });
        if (ok) { resetAll(); navigate('#/login'); toast('حُذفت جميع البيانات'); }
      },
    }, [
      el('span.linkrow__start', {}, [icon('delete_forever', { size: 20, cls: '' }), 'حذف جميع البيانات من هذا الجهاز']),
      icon('chevron_left', { size: 20 }),
    ]),
  ]);

  const main = el('main.main', {}, [
    accountCard,
    sectionTitle('الموقع الجغرافي والقبلة', 'explore'),
    locationCard,
    sectionTitle('إشعارات وتذكيرات المهام', 'notifications_active'),
    notificationsCard,
    sectionTitle('المزامنة بين الأجهزة', 'cloud_sync'),
    syncCard,
    sectionTitle('خطة حفظ القرآن', 'menu_book'),
    memorizeCard,
    sectionTitle('إدارة تحدي الـ 30 يوماً', 'flag'),
    challengeCard,
    sectionTitle('المظهر والتفضيلات', 'palette'),
    themeCard,
    sectionTitle('الدعم والمعلومات', 'info'),
    aboutCard,
    el('p', {
      style: { textAlign: 'center', fontSize: '11px', color: 'var(--on-surface-variant)', lineHeight: '2' },
      text: `${APP_INFO.name} • الإصدار ${APP_INFO.version} • صُمم بإتقان وسكينة`,
    }),
  ]);

  root.append(appbar(), main, navbar('settings'));
}

function exportData() {
  try {
    /* الملف يُشارك ويُحفظ في التنزيلات، فلا يحمل رمز الجلسة ولا مفتاح
       المزامنة: كلاهما يفتح الحساب على من يقع الملف في يده. */
    const { sync, ...safe } = getState();
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `tahaddi30-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('نُزّلت نسخة من بياناتك');
  } catch {
    toast('تعذّر تصدير البيانات');
  }
}
