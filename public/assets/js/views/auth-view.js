/**
 * شاشة الدخول: حساب ببريد أو رقم جوال وكلمة سرّ، أو مفتاح مزامنة، أو ضيف.
 *
 * ثلاث حقائق تُقال للمستخدم في الشاشة لا في الوثائق، لأن جهله بها يكلّفه
 * بياناته:
 *   • كلمة السرّ لا تُرسل، والتحقّق منها يحتاج اتصالاً في أول دخول.
 *   • لا بريد تحقّق ولا رسالة SMS: رمز الاسترجاع هو طريق النسيان الوحيد.
 *   • المعرّف غير مُتحقَّق منه، فهو اسم حساب لا إثبات ملكية.
 */

import { el, icon, toast, sheet } from '../ui.js';
import {
  registerWithPassword, signInWithPassword, resetPasswordWithRecovery,
  signInAsGuest, signInWithSyncKey,
} from '../auth.js';
import { normalizeIdentifier, passwordProblem, passwordStrength, MIN_PASSWORD } from '../password.js';
import { generateSyncKey, formatSyncKey } from '../sync.js';
import { hijriDate } from '../datetime.js';
import { getState } from '../store.js';

/* --------------------------------------------------------------- عناصر عامة */

const field = (label, glyph, input, hint) => el('label.field', {}, [
  el('span.field__label', {}, [icon(glyph, { size: 18 }), label]),
  input,
  hint ? el('span.field__hint', { text: hint }) : null,
]);

const identifierInput = (autocomplete = 'username') => el('input.input', {
  type: 'text',
  inputmode: 'email',
  autocomplete,
  autocapitalize: 'none',
  spellcheck: 'false',
  placeholder: 'name@mail.com أو 05XXXXXXXX',
  'aria-label': 'البريد أو رقم الجوال',
});

const passwordInput = (autocomplete, label) => el('input.input', {
  type: 'password',
  autocomplete,
  placeholder: '••••••••••',
  'aria-label': label,
});

/** يعرض رمز الاسترجاع مرة واحدة ولا يُغلق إلا بإقرار الحفظ. */
function recoverySheet(code, { title, onDone }) {
  sheet({
    title,
    desc: 'هذا الرمز هو طريقك الوحيد إلى الحساب إن نسيت كلمة السرّ. لا يُعرض مرة أخرى ولا يستطيع أحد استخراجه — احفظه الآن في مكان آمن.',
    content: (close) => el('div', {}, [
      el('input.input.tnum', {
        readonly: true,
        value: formatSyncKey(code),
        'aria-label': 'رمز الاسترجاع',
        style: { textAlign: 'center', letterSpacing: '.06em', fontSize: '15px' },
        onclick: (e) => e.target.select(),
      }),
      el('button.btn.btn--tonal.btn--block', {
        type: 'button',
        style: { marginTop: '.6rem' },
        onclick: async (e) => {
          try {
            await navigator.clipboard.writeText(formatSyncKey(code));
            toast('نُسخ رمز الاسترجاع');
          } catch {
            e.target.closest('div').querySelector('input')?.select();
            toast('انسخ الرمز يدوياً');
          }
        },
      }, [icon('content_copy', { size: 18 }), 'نسخ الرمز']),
      el('button.btn.btn--primary.btn--block', {
        type: 'button',
        style: { marginTop: '.5rem' },
        onclick: () => { close(); onDone(); },
      }, [icon('check', { size: 18 }), 'حفظته — متابعة']),
    ]),
  });
}

/* ------------------------------------------------------- استرجاع بالرمز */

function recoverSheet(prefill, onDone) {
  sheet({
    title: 'استرجاع الحساب',
    desc: 'أدخل رمز الاسترجاع الذي ظهر لك عند إنشاء الحساب، واختر كلمة سرّ جديدة. الرمز يُستبدل بعدها بآخر جديد.',
    content: (close) => {
      const id = identifierInput();
      id.value = prefill || '';
      const code = el('input.input.tnum', {
        placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
        'aria-label': 'رمز الاسترجاع',
        autocapitalize: 'characters',
        spellcheck: 'false',
        style: { textAlign: 'center', letterSpacing: '.06em' },
      });
      const next = passwordInput('new-password', 'كلمة السرّ الجديدة');

      const go = el('button.btn.btn--primary.btn--block', {
        type: 'button',
        style: { marginTop: '.7rem' },
        onclick: async () => {
          go.disabled = true;
          const label = go.lastChild;
          label.textContent = 'جارٍ الاسترجاع…';
          try {
            const res = await resetPasswordWithRecovery({
              identifier: id.value, recovery: code.value, password: next.value,
            });
            close();
            recoverySheet(res.recovery, { title: 'رمز استرجاع جديد', onDone });
          } catch (err) {
            toast(err.message || 'تعذّر الاسترجاع');
            go.disabled = false;
            label.textContent = 'استرجاع الحساب';
          }
        },
      }, [icon('lock_reset', { size: 18 }), 'استرجاع الحساب']);

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.7rem' } }, [
        field('البريد أو رقم الجوال', 'alternate_email', id),
        field('رمز الاسترجاع', 'key', code),
        field('كلمة السرّ الجديدة', 'password', next, `${MIN_PASSWORD} محارف على الأقل.`),
        go,
      ]);
    },
  });
}

/* ------------------------------------------------------- مفتاح المزامنة */

/**
 * حوار المزامنة بمفتاح: إنشاء مفتاح على الجهاز الأول، أو إدخاله على البقية.
 * مقصود أن يكون المفتاح ظاهراً للنسخ لا مخفيّاً: المستخدم محتاج لنقله بنفسه.
 */
function syncKeySheet(onConnected) {
  sheet({
    title: 'المزامنة بمفتاح',
    desc: 'مفتاح واحد يجمع أجهزتك على بيانات واحدة، دون حساب ولا كلمة سرّ. أنشئه هنا وأدخله في باقي أجهزتك.',
    content: (close) => {
      const connect = async (key, btn) => {
        btn.disabled = true;
        try {
          await signInWithSyncKey(key);
          close();
          onConnected();
        } catch (err) {
          toast(err.message || 'تعذّر الاتصال');
          btn.disabled = false;
        }
      };

      /* إنشاء مفتاح جديد */
      const created = el('div', { style: { display: 'none', marginTop: '.7rem' } });
      const newBtn = el('button.btn.btn--primary.btn--block', {
        type: 'button',
        onclick: () => {
          const key = generateSyncKey();
          newBtn.style.display = 'none';
          created.style.display = 'block';
          const input = el('input.input.tnum', {
            readonly: true, value: formatSyncKey(key), 'aria-label': 'مفتاح المزامنة',
            style: { textAlign: 'center', letterSpacing: '.06em', fontSize: '15px' },
          });
          const go = el('button.btn.btn--primary.btn--block', {
            type: 'button', style: { marginTop: '.6rem' },
            onclick: () => connect(key, go),
          }, [icon('cloud_sync', { size: 18 }), 'احفظته — ابدأ المزامنة']);
          created.append(
            input,
            el('button.btn.btn--tonal.btn--block', {
              type: 'button',
              style: { marginTop: '.5rem' },
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(formatSyncKey(key));
                  toast('نُسخ المفتاح');
                } catch {
                  input.select();
                  toast('انسخ المفتاح يدوياً');
                }
              },
            }, [icon('content_copy', { size: 18 }), 'نسخ المفتاح']),
            el('p.field__hint', {
              style: { lineHeight: '1.9', marginTop: '.5rem' },
              text: 'احفظ المفتاح في مكان آمن. هو حسابك وكلمة سرّك معاً: من يملكه يصل إلى بياناتك، وإن فُقد لا يمكن استرجاع البيانات.',
            }),
            go,
          );
        },
      }, [icon('add', { size: 18 }), 'إنشاء مفتاح جديد']);

      /* إدخال مفتاح موجود */
      const input = el('input.input.tnum', {
        placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
        'aria-label': 'مفتاح المزامنة',
        autocapitalize: 'characters',
        spellcheck: 'false',
        style: { textAlign: 'center', letterSpacing: '.06em' },
      });
      const joinBtn = el('button.btn.btn--tonal.btn--block', {
        type: 'button', style: { marginTop: '.6rem' },
        onclick: () => connect(input.value, joinBtn),
      }, [icon('login', { size: 18 }), 'اتصال بهذا المفتاح']);

      return el('div', {}, [
        newBtn,
        created,
        el('div.divider', { text: 'أو' }),
        el('p.field__hint', { style: { marginBottom: '.4rem' }, text: 'عندي مفتاح من جهاز آخر:' }),
        input,
        joinBtn,
      ]);
    },
  });
}

/* ----------------------------------------------------------------- الشاشة */

export function renderAuth(root, { navigate }) {
  const done = () => navigate(getState().onboarded ? '#/home' : '#/welcome');

  let mode = 'signin';                       // signin | register

  const id = identifierInput();
  const password = passwordInput('current-password', 'كلمة السرّ');
  const confirm = passwordInput('new-password', 'تأكيد كلمة السرّ');

  /* مقياس القوة يظهر عند إنشاء الحساب وحده: في الدخول لا معنى لتقييم
     كلمة سرّ قديمة، وإظهاره هناك يوهم بأن الدخول مرفوض لضعفها. */
  const meterFill = el('div.track__fill', { style: { width: '0%' } });
  const meterLabel = el('span.field__hint', { text: '' });
  const meter = el('div', { style: { display: 'none' } }, [
    el('div.track', { style: { marginBlock: '.35rem' } }, [meterFill]),
    meterLabel,
  ]);

  const confirmField = field('تأكيد كلمة السرّ', 'done_all', confirm);
  confirmField.style.display = 'none';

  const submit = el('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, [
    icon('login', { size: 20 }),
    el('span', { text: 'دخول' }),
  ]);

  const switchBtn = el('button', {
    type: 'button',
    style: { color: 'var(--secondary)', fontWeight: '700', textDecoration: 'underline', textUnderlineOffset: '3px' },
  }, ['ليس لديّ حساب — أنشئ حساباً جديداً']);

  const forgotBtn = el('button', {
    type: 'button',
    style: { color: 'var(--on-surface-variant)', fontSize: '12px', textDecoration: 'underline', textUnderlineOffset: '3px' },
    onclick: () => recoverSheet(id.value, done),
  }, ['نسيت كلمة السرّ؟']);

  const hint = el('p.field__hint', { style: { lineHeight: '1.9' } });

  const paint = () => {
    const creating = mode === 'register';
    submit.lastChild.textContent = creating ? 'إنشاء الحساب' : 'دخول';
    submit.firstChild.textContent = creating ? 'person_add' : 'login';
    switchBtn.textContent = creating ? 'لديّ حساب — دخول' : 'ليس لديّ حساب — أنشئ حساباً جديداً';
    confirmField.style.display = creating ? '' : 'none';
    meter.style.display = creating ? '' : 'none';
    forgotBtn.style.display = creating ? 'none' : '';
    password.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    hint.textContent = creating
      ? `كلمة السرّ لا تُرسل إلى الخادم: يُشتقّ منها مفتاح على جهازك. ${MIN_PASSWORD} محارف على الأقل، وبعد الإنشاء يظهر رمز استرجاع احفظه.`
      : 'أول دخول على جهاز جديد يحتاج اتصالاً بالإنترنت؛ بعده يعمل التطبيق كاملاً دون شبكة.';
  };

  password.addEventListener('input', () => {
    const { score, label } = passwordStrength(password.value);
    meterFill.style.width = `${score * 25}%`;
    meterLabel.textContent = password.value
      ? (passwordProblem(password.value, normalizeIdentifier(id.value)) || `قوة كلمة السرّ: ${label}`)
      : '';
  });

  switchBtn.addEventListener('click', () => {
    mode = mode === 'signin' ? 'register' : 'signin';
    paint();
    id.focus();
  });

  const form = el('form', {
    style: { display: 'flex', flexDirection: 'column', gap: '.7rem' },
    onsubmit: async (event) => {
      event.preventDefault();
      if (mode === 'register' && password.value !== confirm.value) {
        toast('كلمتا السرّ غير متطابقتين');
        return;
      }

      submit.disabled = true;
      const label = submit.lastChild.textContent;
      submit.lastChild.textContent = mode === 'register' ? 'جارٍ إنشاء الحساب…' : 'جارٍ التحقّق…';

      try {
        if (mode === 'register') {
          const res = await registerWithPassword({ identifier: id.value, password: password.value });
          recoverySheet(res.recovery, { title: 'رمز الاسترجاع', onDone: done });
        } else {
          await signInWithPassword({ identifier: id.value, password: password.value });
          done();
        }
      } catch (err) {
        toast(err.message || 'تعذّر إتمام العملية', { duration: 5200 });
        submit.disabled = false;
        submit.lastChild.textContent = label;
      }
    },
  }, [
    field('البريد أو رقم الجوال', 'alternate_email', id),
    el('div', {}, [field('كلمة السرّ', 'password', password), meter]),
    confirmField,
    submit,
    el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.4rem' } }, [
      switchBtn,
      forgotBtn,
    ]),
    hint,
  ]);

  paint();

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

    form,

    el('div.divider', { text: 'أو' }),

    el('button.btn.btn--tonal.btn--block.btn--lg', {
      type: 'button',
      onclick: () => syncKeySheet(done),
    }, [icon('key', { size: 20 }), 'المزامنة بمفتاح • بلا كلمة سرّ']),

    el('button.btn.btn--tonal.btn--block.btn--lg', {
      type: 'button',
      onclick: () => { signInAsGuest(); done(); },
    }, [icon('person', { size: 20 }), 'الدخول كضيف • على هذا الجهاز فقط']),

    el('div.card', { style: { display: 'flex', gap: '.85rem', alignItems: 'flex-start' } }, [
      el('span.permcard__glyph.permcard__glyph--mint', {}, [icon('cloud_sync', { size: 22 })]),
      el('div', {}, [
        el('div.permcard__title', { text: 'أنت تختار مكان بياناتك' }),
        el('div.permcard__desc', { text: 'كضيف: تبقى مهامك في هذا المتصفح وحده ولا تُرسل إلى أي خادم. بحساب أو بمفتاح: تُحفظ نسخة في قاعدة بياناتك على Cloudflare لتصل إلى بقية أجهزتك، ولا تُشارك مع أي طرف آخر.' }),
      ]),
    ]),

    el('div.gate__foot', {}, [
      el('span', { text: 'البريد ورقم الجوال لا يُتحقَّق منهما برسالة: كلٌّ منهما اسم حساب، ورمز الاسترجاع هو ما يعيده إليك.' }),
      el('span', { text: 'مواقيت الصلاة واتجاه القبلة تُحسب على جهازك، ولا يُرسل موقعك إلى أي خادم.' }),
    ]),
  ]);

  root.append(gate);
}
