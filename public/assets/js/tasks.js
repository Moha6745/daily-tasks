/**
 * منطق المهام: الإضافة، التصنيف إلى (يومية / أسبوعية / شهرية)، والتكرار.
 *
 * قاعدة التصنيف المطلوبة:
 *   • المتكررة كل يوم                            → المهام اليومية
 *   • المتكررة كل أسبوع                          → المهام الأسبوعية (دائماً)
 *   • غير المتكررة وتاريخها اليوم                 → المهام اليومية
 *   • غير المتكررة بعد اليوم وحتى سبت هذا الأسبوع → المهام الأسبوعية
 *   • غير المتكررة بعد سبت هذا الأسبوع            → المهام الشهرية
 *   • غير المتكررة مضى تاريخها ولم تُنجز          → ضمن اليومية بوسم "متأخرة"
 *   • غير المتكررة مضى تاريخها وأُنجزت            → تغادر القائمة ولا تُحذف
 *
 * والتكرار نوعان: يومي تظهر معه المهمة كل يوم، وأسبوعي تظهر في اليوم نفسه
 * من كل أسبوع (اليوم الذي يوافق تاريخها)، ويُحتسب إنجازها لكل يوم على حدة.
 *
 * وخانةُ العرض شيء و«مهام اليوم» شيء آخر: الأولى ترتّب الشاشة، والثانية
 * (todaysTasks) تقول ما على صاحبها اليوم فعلاً، وعليها تُبنى نسبة الالتزام
 * والتذكيرات وإعلان اكتمال اليوم.
 */

import { getState, setTasks, update } from './store.js';
import { todayKey, endOfWeekKey, daysBetween, fromKey, dateKey, currentWeekDays, addDays } from './datetime.js';
import { iconFromTitle, categoryFromTitle, NEUTRAL_ICON } from './classify.js';

/* مفردات تصنيف المهمة. تُحفظ مع المهمة وتُزامَن، ولا تحمل أيقونة:
   الأيقونة من نصّ المهمة وحده (taskIcon أدناه). */
export const CATEGORIES = {
  spiritual:   { name: 'ديني وروحاني', desc: 'صلوات، ورد، ذِكر' },
  work:        { name: 'عمل وإنتاجية',  desc: 'مهام ومشاريع' },
  health:      { name: 'صحة ورياضة',    desc: 'تمارين، شرب ماء' },
  learning:    { name: 'قراءة وتعلّم',  desc: 'كتب، دورات، تدبّر' },
  other:       { name: 'عامة',          desc: 'مهام أخرى' },
};

/* المهمة التي لم تُعرف من نصّها تبقى بلا تصنيف ظاهر: أيقونة محايدة خير من
   أيقونة تقول غير ما يقوله النصّ. */
export const DEFAULT_CATEGORY = 'other';

/**
 * أيقونة المهمة: من نصّها، وإلا فالمحايدة.
 *
 * ولا تُشتقّ من التصنيف المحفوظ وإن وُجد: لم تكن في التطبيق شاشةٌ تختاره
 * قطّ، فكل مهمة قديمة تحمل `spiritual` لأنه كان الافتراضي لا لأن صاحبها
 * اختاره. فالرجوع إليه يُعيد أيقونة المسجد على مهمة لا علاقة لها به — وهي
 * العلّة نفسها التي من أجلها كُتب هذا كلّه.
 *
 * والاشتقاق عند العرض لا عند الإنشاء مقصود: تحسين قاعدة في classify.js
 * يصلح المهام القديمة كلّها بلا ترحيل ولا كتابة في القاعدة.
 */
export function taskIcon(task) {
  return iconFromTitle(task?.title) || NEUTRAL_ICON;
}

const uid = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const REPEATS = ['none', 'daily', 'weekly'];

/**
 * نوع تكرار المهمة: 'none' | 'daily' | 'weekly'.
 * النسخ السابقة عرفت التكرار اليومي وحده عبر repeatDaily، فنقبله قراءةً.
 */
export function repeatOf(task) {
  if (REPEATS.includes(task?.repeat)) return task.repeat;
  return task?.repeatDaily ? 'daily' : 'none';
}

/** هل تقع المهمة في هذا اليوم؟ */
export function occursOn(task, day = todayKey()) {
  const repeat = repeatOf(task);
  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return fromKey(task.date).getDay() === fromKey(day).getDay();
  return task.date === day;
}

/** أقرب يوم تقع فيه المهمة الأسبوعية من اليوم فصاعداً. */
function nextWeeklyKey(task, today) {
  const base = fromKey(today);
  const shift = (fromKey(task.date).getDay() - base.getDay() + 7) % 7;
  return dateKey(addDays(base, shift));
}

/**
 * يُنشئ مهمة جديدة.
 * @param {{title:string, date?:string, repeat?:string, category?:string, reminder?:string|null}} input
 */
export function addTask(input) {
  const title = String(input.title || '').trim();
  if (!title) return null;

  const repeat = REPEATS.includes(input.repeat) ? input.repeat : (input.repeatDaily ? 'daily' : 'none');

  const task = {
    id: uid(),
    title: title.slice(0, 200),
    date: input.date || todayKey(),      // تلقائياً تاريخ اليوم
    repeat,
    // يبقى للنسخ القديمة على أجهزة أخرى كي لا تفقد تكرار المهمة عند المزامنة
    repeatDaily: repeat === 'daily',
    category: CATEGORIES[input.category] ? input.category : (categoryFromTitle(title) || DEFAULT_CATEGORY),
    reminder: input.reminder || null,    // 'HH:MM' أو null
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),               // طابع المزامنة: الأحدث يفوز عند التعارض
    done: false,                         // للمهام غير المتكررة
    completions: {},                     // للمتكررة: { 'YYYY-MM-DD': true }
  };

  const state = getState();
  setTasks([...state.tasks, task]);
  ensureChallengeStarted();
  return task;
}

export function updateTask(id, patch) {
  const tasks = getState().tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t));
  setTasks(tasks);
}

/**
 * الحذف يترك شاهداً.
 * بدونه يرى الجهاز الآخر مهمة عنده وليست عند الخادم فيعيد دفعها،
 * فتعود المهمة المحذوفة من تلقاء نفسها.
 */
export function removeTask(id) {
  const state = getState();
  update({
    tasks: state.tasks.filter((t) => t.id !== id),
    trash: [...(state.trash || []).filter((r) => r.id !== id), { id, updatedAt: Date.now() }],
  });
}

/** هل المهمة منجزة في اليوم المعطى؟ */
export function isDone(task, day = todayKey()) {
  return repeatOf(task) === 'none' ? Boolean(task.done) : Boolean(task.completions?.[day]);
}

/**
 * اليوم الذي تخصّه المهمة الآن.
 *
 * المتكررة أسبوعياً تظهر في قائمة الأسبوع ولو كان موعدها بعد أيام، فلا يصحّ
 * أن يُسجَّل إنجازها في يوم لا تقع فيه: من ضغطها الاثنين يقصد موعدَها لا
 * الاثنين. ولذلك يُحسم اليوم من المهمة نفسها لا من التقويم.
 */
export function occurrenceKey(task, today = todayKey()) {
  const repeat = repeatOf(task);
  if (repeat === 'weekly') return nextWeeklyKey(task, today);
  if (repeat === 'daily') return today;
  return task.date;
}

/** هل المهمة منجزة في يومها الجاري؟ هذا ما يُعرض ويُعدّ في القوائم. */
export function isDoneNow(task, today = todayKey()) {
  return isDone(task, occurrenceKey(task, today));
}

/** يقلب حالة الإنجاز. المتكررة تُسجَّل لكل يوم على حدة. */
export function toggleTask(id, day = todayKey()) {
  const tasks = getState().tasks.map((t) => {
    if (t.id !== id) return t;
    if (repeatOf(t) !== 'none') {
      const completions = { ...(t.completions || {}) };
      if (completions[day]) delete completions[day];
      else completions[day] = new Date().toISOString();
      return { ...t, completions, updatedAt: Date.now() };
    }
    return { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString(), updatedAt: Date.now() };
  });
  setTasks(tasks);
  ensureChallengeStarted();
  return isDone(tasks.find((t) => t.id === id), day);
}

/** الخانة التي تنتمي إليها المهمة اليوم. */
export function bucketOf(task, today = todayKey()) {
  const repeat = repeatOf(task);
  if (repeat === 'daily') return 'daily';

  // المتكررة كل أسبوع تسكن قائمة الأسبوع ولو وافق موعدُها اليوم: اسمها
  // يقول «كل أسبوع»، فمكانها حيث يتوقّعها صاحبها. ويُنبَّه في صفّها أن
  // موعدها اليوم كي لا تفوت.
  if (repeat === 'weekly') return 'weekly';

  const weekEnd = endOfWeekKey(fromKey(today));
  const diff = daysBetween(today, task.date);

  if (diff <= 0) return 'daily';                                   // اليوم أو متأخرة
  if (daysBetween(task.date, weekEnd) >= 0) return 'weekly';       // حتى سبت هذا الأسبوع
  return 'monthly';                                                // بعد السبت
}

/**
 * مهمة فرغ أمرها: غير متكررة، مضى يومها، وأُنجزت.
 *
 * تبقى محفوظة — جدول المتابعة وسجلّ الأيام يحتاجانها — لكنها تغادر قوائم
 * اليوم. وإلا تراكمت إنجازات الأمس في قائمة اليوم بلا فائدة.
 */
function isSettled(task, today) {
  return repeatOf(task) === 'none' && task.done && daysBetween(today, task.date) < 0;
}

/** هل المهمة متأخرة (تاريخها مضى ولم تُنجز)؟ المتكررة لا تتأخّر. */
export function isOverdue(task, today = todayKey()) {
  if (repeatOf(task) !== 'none') return false;
  return !task.done && daysBetween(today, task.date) < 0;
}

/**
 * يرتّب المهام داخل الخانة: غير المنجزة أولاً، ثم حسب التاريخ، والمنجزة في الأسفل.
 */
function sortTasks(list, today) {
  return [...list].sort((a, b) => {
    const da = isDoneNow(a, today);
    const db = isDoneNow(b, today);
    if (da !== db) return da ? 1 : -1;              // المنجزة تنزل أسفل القائمة
    // بالموعد القادم لا بالتاريخ المكتوب: الأسبوعية تاريخها أوّل مرة أُنشئت
    const ka = occurrenceKey(a, today);
    const kb = occurrenceKey(b, today);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const ra = repeatOf(a) !== 'none';
    const rb = repeatOf(b) !== 'none';
    if (ra !== rb) return ra ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

/** يقسّم كل المهام إلى الخانات الثلاث، مرتّبة وجاهزة للعرض. */
export function groupTasks(today = todayKey()) {
  const groups = { daily: [], weekly: [], monthly: [] };
  for (const task of getState().tasks) {
    if (isSettled(task, today)) continue;
    groups[bucketOf(task, today)].push(task);
  }
  return {
    daily: sortTasks(groups.daily, today),
    weekly: sortTasks(groups.weekly, today),
    monthly: sortTasks(groups.monthly, today),
  };
}

/**
 * مهام اليوم: ما يقع في هذا اليوم فعلاً.
 *
 * كانت تُؤخذ من خانة العرض اليومية، فصارت نسبةُ الالتزام والتذكيراتُ
 * وإعلانُ اكتمال اليوم تتبع ترتيبَ الشاشة لا واقعَ اليوم: مهمة أسبوعية
 * موعدها اليوم لا تُحتسب لأنها تُعرض في قائمة الأسبوع، ومهمة متأخرة من
 * الشهر الماضي تُحتسب على اليوم لأنها تُعرض فيه. فُصل المفهومان.
 */
export function todaysTasks(today = todayKey()) {
  return sortTasks(getState().tasks.filter((t) => occursOn(t, today)), today);
}

/** المهام المتكررة وحدها، مرتّبة كما أُنشئت — وهي أعمدة جدول المتابعة. */
export function recurringTasks() {
  return getState().tasks
    .filter((t) => repeatOf(t) !== 'none')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * ينقل مهمة متأخرة إلى تاريخ اليوم.
 * لمن مرّ موعد مهمته ولم يُنجزها فأراد استئنافها اليوم بدل أن تبقى متأخرة.
 */
export function rescheduleToToday(id) {
  updateTask(id, { date: todayKey() });
}

/** عدد المتبقي/المنجز في مجموعة. */
export function countOpen(list, today = todayKey()) {
  return list.filter((t) => !isDoneNow(t, today)).length;
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
  const tasks = getState().tasks.filter((t) => occursOn(t, day));
  if (!tasks.length) return false;
  return tasks.every((t) => isDone(t, day));
}

/** ملخّص التحدي: اليوم الحالي، النسبة، وحالة أيام الأسبوع الجاري. */
export function challengeSummary(today = todayKey()) {
  const { challenge } = getState();
  const start = challenge.startDate || today;
  const length = challenge.length || 30;
  const dayNumber = Math.min(length, Math.max(1, daysBetween(start, today) + 1));

  const todayTasks = todaysTasks(today);
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
