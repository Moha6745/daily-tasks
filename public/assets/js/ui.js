/** أدوات بناء الواجهة: إنشاء العناصر، الأيقونات، التنبيهات المنبثقة، والأوراق السفلية. */

/** ينشئ عنصراً: el('div.card', {onclick}, [children]) */
export function el(spec, attrs = {}, children = []) {
  const [tagPart, ...classes] = String(spec).split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = [node.className, value].filter(Boolean).join(' ');
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** أيقونة Material Symbols. */
export function icon(name, { size, fill = false, cls = '' } = {}) {
  return el(`span.material-symbols-outlined${fill ? '.fill' : ''}`, {
    text: name,
    class: cls,
    'aria-hidden': 'true',
    style: size ? { fontSize: `${size}px` } : {},
  });
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ------------------------------------------------------------- التنبيهات */
let toastTimer = null;

export function toast(message, { duration = 2800 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = el('div.toast', { role: 'status', 'aria-live': 'polite', text: message });
  document.body.append(node);
  toastTimer = setTimeout(() => node.remove(), duration);
}

/* -------------------------------------------------------- الورقة السفلية */

/**
 * يفتح ورقة سفلية. content: دالة تتلقى (close) وتعيد عقدة DOM.
 */
export function sheet({ title, desc, content, onClose }) {
  const backdrop = el('div.sheet-backdrop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'حوار' });
  const panel = el('div.sheet');

  const close = () => {
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose?.();
  };

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  panel.append(el('div.sheet__grab'));
  if (title) panel.append(el('h2.sheet__title', { text: title }));
  if (desc) panel.append(el('p.sheet__desc', { text: desc }));
  if (content) panel.append(content(close));

  backdrop.append(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.classList.add('no-scroll');
  document.body.append(backdrop);

  panel.querySelector('input,select,textarea,button')?.focus();
  return close;
}

/** حوار تأكيد بسيط. */
export function confirmSheet({ title, desc, confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const close = sheet({
      title,
      desc,
      onClose: () => { if (!answered) resolve(false); },
      content: (dismiss) => el('div.sheet__actions', {}, [
        el('button.btn.btn--tonal', {
          type: 'button', text: cancelText,
          onclick: () => { answered = true; dismiss(); resolve(false); },
        }),
        el(`button.btn.${danger ? 'btn--gold' : 'btn--primary'}`, {
          type: 'button', text: confirmText,
          onclick: () => { answered = true; dismiss(); resolve(true); },
        }),
      ]),
    });
    return close;
  });
}

/** حلقة تقدّم دائرية (SVG). */
export function progressRing(percent, { size = 88, stroke = 7, track = 'rgba(255,255,255,.18)', color = 'var(--secondary-container)' } = {}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');

  const base = document.createElementNS(ns, 'circle');
  const arc = document.createElementNS(ns, 'circle');
  for (const c of [base, arc]) {
    c.setAttribute('cx', size / 2);
    c.setAttribute('cy', size / 2);
    c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', stroke);
  }
  base.setAttribute('stroke', track);
  arc.setAttribute('stroke', color);
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', circumference.toFixed(2));
  arc.setAttribute('stroke-dashoffset', offset.toFixed(2));
  arc.style.transition = 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)';
  svg.append(base, arc);
  return svg;
}

/** مفتاح تشغيل/إيقاف. */
export function toggle(checked, onChange, label) {
  const btn = el('button.switch', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    'aria-label': label || 'تبديل',
  });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', next ? 'true' : 'false');
    onChange(next, btn);
  });
  return btn;
}
