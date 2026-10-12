/**
 * خطة الحفظ: حالتها في المخزن، وتسجيل إنجاز كل ورد.
 *
 * الإنجاز يُسجَّل لكل وجه على حدة لا لكل صف، لأن حجم الورد قابل للتغيير:
 * لو حُفظ الصف لتغيّر معناه عند تغيير الخطة، أما الوجه فثابت لا يتبدّل،
 * فيبقى المحفوظ محفوظاً مهما أُعيد تقسيم المصحف.
 */

import { getState, update } from './store.js';
import { todayKey } from './datetime.js';
import { buildPlan, clampPagesPerDay, TOTAL_PAGES } from './quran.js';

export function memorizeState() {
  const m = getState().memorize || {};
  return {
    pagesPerDay: clampPagesPerDay(m.pagesPerDay),
    pages: m.pages && typeof m.pages === 'object' ? m.pages : {},
  };
}

/** يغيّر حجم الورد اليومي؛ المحفوظ لا يضيع لأنه مسجَّل بالأوجه. */
export function setPagesPerDay(value) {
  const { pages } = memorizeState();
  update({ memorize: { pagesPerDay: clampPagesPerDay(value), pages } });
}

/** تاريخ حفظ الوجه، أو null. */
export function pageDoneAt(page) {
  return memorizeState().pages[String(page)] || null;
}

/** الصف منجز إذا حُفظت كل أوجهه. */
export function rowDone(row) {
  const { pages } = memorizeState();
  return row.pages.every((p) => Boolean(pages[String(p)]));
}

/** تاريخ إتمام الصف = أحدث تاريخ بين أوجهه، أو null إن لم يكتمل. */
export function rowDoneAt(row) {
  const { pages } = memorizeState();
  let latest = null;
  for (const p of row.pages) {
    const at = pages[String(p)];
    if (!at) return null;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

/**
 * يقلب حالة الصف: يسجّل كل أوجهه بتاريخ اليوم، أو يمسحها.
 * يعيد الحالة الجديدة (منجز أم لا).
 */
export function toggleRow(row, day = todayKey()) {
  const { pagesPerDay, pages } = memorizeState();
  const next = { ...pages };
  const done = row.pages.every((p) => Boolean(next[String(p)]));
  for (const p of row.pages) {
    if (done) delete next[String(p)];
    else next[String(p)] = day;
  }
  update({ memorize: { pagesPerDay, pages: next } });
  return !done;
}

/** كم وجهاً حُفظ من الصف (قد يكون جزئياً بعد تغيير حجم الورد). */
export function rowDoneCount(row) {
  const { pages } = memorizeState();
  return row.pages.filter((p) => Boolean(pages[String(p)])).length;
}

export function resetProgress() {
  const { pagesPerDay } = memorizeState();
  update({ memorize: { pagesPerDay, pages: {} } });
}

/** الخطة الحالية صفوفاً جاهزة للعرض. */
export function currentPlan() {
  return buildPlan(memorizeState().pagesPerDay);
}

/** ملخّص التقدّم: الأوجه المحفوظة، النسبة، الصف التالي، والمدة المتبقية. */
export function planSummary(plan = currentPlan()) {
  const { pagesPerDay, pages } = memorizeState();
  const donePages = Object.keys(pages).length;
  const doneRows = plan.filter((row) => row.pages.every((p) => Boolean(pages[String(p)]))).length;
  const nextRow = plan.find((row) => !row.pages.every((p) => Boolean(pages[String(p)]))) || null;
  return {
    pagesPerDay,
    donePages,
    totalPages: TOTAL_PAGES,
    doneRows,
    totalRows: plan.length,
    remainingRows: plan.length - doneRows,
    percent: Math.round((donePages / TOTAL_PAGES) * 100),
    nextRow,
  };
}
