/**
 * منطق المهام: الإضافة، التصنيف إلى (يومية / أسبوعية / شهرية)، والتكرار.
 *
 * قاعدة التصنيف المطلوبة:
 *   • تاريخ المهمة = اليوم                       → المهام اليومية
 *   • بعد اليوم وحتى السبت من نفس الأسبوع        → المهام الأسبوعية
 *   • بعد سبت هذا الأسبوع                        → المهام الشهرية
 *   • قبل اليوم ولم تُنجز                        → تظهر ضمن اليومية بوسم "متأخرة"
 */

import { getState, setTasks, update } from './store.js';
import { todayKey, endOfWeekKey, daysBetween, fromKey, dateKey, currentWeekDays } from './datetime.js';

export const CATEGORIES = {
  spiritual:   { name: 'ديني وروحاني', desc: 'صلوات، ورد، ذِكر',      icon: 'mosque' },
  work:        { name: 'عمل وإنتاجية',  desc: 'مهام ومشاريع',          icon: 'work' },
  health:      { name: 'صحة ورياضة',    desc: 'تمارين، شرب ماء',       icon: 'exercise' },
  learning:    { name: 'قراءة وتعلّم',  desc: 'كتب، دورات، تدبّر',     icon: 'menu_book' },
};

export const DEFAULT_CATEGORY = 'spiritual';

const uid = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * يُنشئ مهمة جديدة.
 * @param {{title:string, date?:string, repeatDaily?:boolean, category?:string, reminder?:string|null}} input
 */
export function addTask(input) {
  const title = String(input.title || '').trim();
  if (!title) return null;

  const task = {
    id: uid(),
    title: title.slice(0, 200),
    date: input.date || todayKey(),      // تلقائياً تاريخ اليوم
    repeatDaily: Boolean(input.repeatDaily),
    category: CATEGORIES[input.category] ? input.category : DEFAULT_CATEGORY,
    reminder: input.reminder || null,    // 'HH:MM' أو null
    createdAt: new Date().toISOString(),
    done: false,                         // للمهام غير المتكررة
    completions: {},                     // للمتكررة: { 'YYYY-MM-DD': true }
  };

  const state = getState();
  setTasks([...state.tasks, task]);
  ensureChallengeStarted();
  return task;
}

export function updateTask(id, patch) {
  const tasks = getState().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  setTasks(tasks);
}

export function removeTask(id) {
  setTasks(getState().tasks.filter((t) => t.id !== id));
}

/** هل المهمة منجزة في اليوم المعطى؟ */
export function isDone(task, day = todayKey()) {
  return task.repeatDaily ? Boolean(task.completions?.[day]) : Boolean(task.done);
}

/** يقلب حالة الإنجاز. المتكررة تُسجَّل لكل يوم على حدة. */
export function toggleTask(id, day = todayKey()) {
  const tasks = getState().tasks.map((t) => {
    if (t.id !== id) return t;
    if (t.repeatDaily) {
      const completions = { ...(t.completions || {}) };
      if (completions[day]) delete completions[day];
      else completions[day] = new Date().toISOString();
      return { ...t, completions };
    }
    return { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString() };
  });
  setTasks(tasks);
  ensureChallengeStarted();
  return isDone(tasks.find((t) => t.id === id), day);
}

/** الخانة التي تنتمي إليها المهمة اليوم. */
export function bucketOf(task, today = todayKey()) {
  if (task.repeatDaily) return 'daily';

  const weekEnd = endOfWeekKey(fromKey(today));
  const diff = daysBetween(today, task.date);

  if (diff <= 0) return 'daily';                                  // اليوم أو متأخرة
  if (daysBetween(task.date, weekEnd) >= 0) return 'weekly';      // حتى سبت هذا الأسبوع
  return 'monthly';                                               // بعد السبت
}

/** هل المهمة متأخرة (تاريخها مضى ولم تُنجز)؟ */
export function isOverdue(task, today = todayKey()) {
  if (task.repeatDaily) return false;
  return !task.done && daysBetween(today, task.date) < 0;
}

/**
 * يرتّب المهام داخل الخانة: غير المنجزة أولاً، ثم حسب التاريخ، والمنجزة في الأسفل.
 */
function sortTasks(list, today) {
  return [...list].sort((a, b) => {
    const da = isDone(a, today);
    const db = isDone(b, today);
    if (da !== db) return da ? 1 : -1;              // المنجزة تنزل أسفل القائمة
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.repeatDaily !== b.repeatDaily) return a.repeatDaily ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

/** يقسّم كل المهام إلى الخانات الثلاث، مرتّبة وجاهزة للعرض. */
export function groupTasks(today = todayKey()) {
  const groups = { daily: [], weekly: [], monthly: [] };
  for (const task of getState().tasks) {
    groups[bucketOf(task, today)].push(task);
  }
  return {
    daily: sortTasks(groups.daily, today),
    weekly: sortTasks(groups.weekly, today),
    monthly: sortTasks(groups.monthly, today),
  };
}

/** عدد المتبقي/المنجز في مجموعة. */
export function countOpen(list, today = todayKey()) {
  return list.filter((t) => !isDone(t, today)).length;
}

/* ------------------------------------------------------ تحدي الـ 30 يوماً */

/** يبدأ التحدي عند أول نشاط حقيقي للمستخدم. */
export function ensureChallengeStarted() {
  const { challenge } = getState();
  if (!challenge.startDate) update({ challenge: { startDate: todayKey() } });
}

export function startNewChallenge() {
  update({ challenge: { startDate: todayKey() } });
}

/** هل أُنجزت كل مهام ذلك اليوم؟ يوم بلا مهام لا يُحتسب. */
export function dayCompleted(day) {
  const tasks = getState().tasks.filter((t) => (t.repeatDaily ? true : t.date === day));
  if (!tasks.length) return false;
  return tasks.every((t) => isDone(t, day));
}

/** ملخّص التحدي: اليوم الحالي، النسبة، وحالة أيام الأسبوع الجاري. */
export function challengeSummary(today = todayKey()) {
  const { challenge } = getState();
  const start = challenge.startDate || today;
  const length = challenge.length || 30;
  const dayNumber = Math.min(length, Math.max(1, daysBetween(start, today) + 1));

  const groups = groupTasks(today);
  const todayTasks = groups.daily;
  const doneToday = todayTasks.filter((t) => isDone(t, today)).length;
  const percent = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;

  const week = currentWeekDays(fromKey(today)).map((d) => {
    const key = dateKey(d);
    return {
      key,
      date: d,
      isToday: key === today,
      isPast: key < today,
      completed: key <= today && dayCompleted(key),
    };
  });

  return { start, length, dayNumber, percent, doneToday, totalToday: todayTasks.length, week };
}
