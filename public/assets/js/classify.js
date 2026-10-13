/**
 * استنتاج أيقونة المهمة من نصّها.
 *
 * قبل هذا كانت كل مهمة تأخذ التصنيف الافتراضي فتظهر بأيقونة مسجد، فيرى
 * المستخدم «تمرين كورة» وبجانبها مسجد. والأيقونة التي تناقض النصّ أسوأ من
 * غيابها: العين تقرؤها قبل الكلمة فتضلّ.
 *
 * الاستنتاج بقائمة كلمات مرتّبة — لا نموذج ولا طلب شبكة — لأنه يجري عند كل
 * رسم ويجب أن يعمل دون اتصال. والترتيب جزء من المعنى: الأخصّ قبل الأعمّ، كي
 * تُقرأ «صلاة العشاء» صلاةً لا وجبةَ عشاء.
 *
 * والأيقونة تُشتقّ من العنوان عند العرض لا تُحفظ مع المهمة، فتصحيح قاعدة
 * هنا يصحّح المهام القديمة كلّها بلا ترحيل. والتصنيف وحده يُحفظ.
 */

/* ------------------------------------------------------------ النرملة */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** يوحّد ما يختلف رسمه ولا يختلف معناه: الهمزات، والألف المقصورة، والتاء المربوطة. */
export function normalizeArabic(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.codePointAt(0) - 0x0660))
    .toLowerCase();
}

/* السوابق التي تلتصق بأول الكلمة في العربية. تُجرَّب كلّها لأن المستخدم
   يكتب «الكتاب» و«وكتاب» و«بالكتاب» ويقصد الكتاب نفسه. */
const PREFIXES = ['', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'بال', 'كال', 'فال', 'لل', 'ولل', 'بي'];

const tokenize = (text) => normalizeArabic(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * هل تبدأ الكلمة بهذا الجذر بعد تجريدها من سوابقها؟
 *
 * الجذر القصير (ثلاثة أحرف فأقلّ) يُطابَق كاملاً لا بالبداية، وإلّا ابتلع
 * ما ليس منه: «بر» كانت تُطابِق «برمجة»، و«صل» تُطابِق «صلاحية».
 */
function tokenHas(token, word) {
  const whole = word.length <= 3;
  for (const prefix of PREFIXES) {
    const candidate = prefix + word;
    if (whole ? token === candidate : token.startsWith(candidate)) return true;
  }
  return false;
}

/* ------------------------------------------------------------- القواعد */

/**
 * أول قاعدة تطابق تفوز، فالترتيب مقصود:
 *   • الصلاة قبل الطعام («صلاة العشاء» لا عشاءً يُؤكل).
 *   • القرآن قبل الكتب («حفظ الورد» مصحف لا كتاب).
 *   • الرياضة المخصّصة قبل العامّة («كرة قدم» كرةٌ لا نادٍ رياضي).
 */
export const RULES = [
  { icon: 'mosque', category: 'spiritual', words: ['صلاه', 'صلوات', 'صل', 'مسجد', 'جماعه', 'ركعه', 'ركعات', 'ركعتين', 'سنه', 'سنن', 'نافله', 'نوافل', 'وتر', 'تهجد', 'قيام', 'تراويح', 'فجر', 'ظهر', 'عصر', 'مغرب', 'عشاء', 'ضحي', 'جمعه', 'اذان', 'وضوء', 'عمره', 'حج', 'صيام', 'صوم', 'pray', 'prayer'] },
  { icon: 'auto_stories', category: 'spiritual', words: ['قران', 'مصحف', 'تلاوه', 'ورد', 'اوراد', 'حفظ', 'تحفيظ', 'تدبر', 'جزء', 'اجزاء', 'سوره', 'ايه', 'ايات', 'وجه', 'اوجه', 'ختمه', 'تجويد', 'quran'] },
  { icon: 'self_improvement', category: 'spiritual', words: ['اذكار', 'ذكر', 'تسبيح', 'استغفار', 'دعاء', 'ادعيه', 'تامل', 'استرخاء', 'تنفس'] },
  { icon: 'volunteer_activism', category: 'spiritual', words: ['صدقه', 'تصدق', 'زكاه', 'تبرع', 'مساعده'] },

  { icon: 'edit_note', category: 'learning', words: ['كتابه', 'مقال', 'تدوين', 'تلخيص', 'مذكرات', 'يوميات'] },
  { icon: 'menu_book', category: 'learning', words: ['كتاب', 'كتب', 'قراءه', 'اقرا', 'مطالعه', 'روايه', 'ملخص', 'book', 'read'] },
  { icon: 'language', category: 'learning', words: ['لغه', 'انجليزي', 'انقلش', 'english', 'مفردات', 'ترجمه'] },
  { icon: 'school', category: 'learning', words: ['دراسه', 'مذاكره', 'درس', 'دروس', 'محاضره', 'دوره', 'كورس', 'اختبار', 'امتحان', 'واجب', 'جامعه', 'مدرسه', 'تعلم', 'تدريب'] },
  { icon: 'code', category: 'work', words: ['برمجه', 'كود', 'code', 'سكربت', 'خوارزم'] },

  { icon: 'sports_soccer', category: 'health', words: ['كوره', 'كره', 'قدم', 'ملعب', 'مباراه', 'soccer', 'football'] },
  { icon: 'sports_basketball', category: 'health', words: ['سله', 'باسكت', 'basketball'] },
  { icon: 'directions_run', category: 'health', words: ['جري', 'ركض', 'هروله', 'ماراثون', 'run'] },
  { icon: 'directions_walk', category: 'health', words: ['مشي', 'خطوه', 'خطوات', 'walk'] },
  { icon: 'directions_bike', category: 'health', words: ['دراجه', 'سيكل', 'bike', 'cycling'] },
  { icon: 'pool', category: 'health', words: ['سباحه', 'مسبح', 'swim'] },
  { icon: 'fitness_center', category: 'health', words: ['تمرين', 'تمارين', 'رياضه', 'نادي', 'جيم', 'حديد', 'اثقال', 'بطن', 'كارديو', 'gym', 'workout'] },
  { icon: 'water_drop', category: 'health', words: ['ماء', 'مويه', 'شرب', 'لتر', 'كوب', 'اكواب', 'water'] },
  { icon: 'bedtime', category: 'health', words: ['نوم', 'انام', 'استيقاظ', 'سهر', 'قيلوله', 'sleep'] },
  { icon: 'medication', category: 'health', words: ['دواء', 'حبوب', 'فيتامين', 'علاج', 'جرعه'] },
  { icon: 'local_hospital', category: 'health', words: ['طبيب', 'مستشفي', 'عياده', 'فحص', 'تحليل', 'اسنان'] },
  { icon: 'restaurant', category: 'health', words: ['فطور', 'غداء', 'وجبه', 'اكل', 'طعام', 'طبخ', 'دايت', 'ريجيم', 'حميه', 'سعرات'] },
  { icon: 'local_cafe', category: 'health', words: ['قهوه', 'شاي', 'كوفي', 'coffee'] },

  { icon: 'groups', category: 'work', words: ['اجتماع', 'لقاء', 'meeting', 'عرض'] },
  { icon: 'mail', category: 'work', words: ['ايميل', 'بريد', 'email', 'رساله', 'رسائل'] },
  { icon: 'call', category: 'work', words: ['مكالمه', 'اتصال', 'اتصل', 'كلم', 'call'] },
  { icon: 'work', category: 'work', words: ['عمل', 'شغل', 'دوام', 'تقرير', 'مشروع', 'عميل', 'وظيفه', 'مهمه', 'ملف', 'مستند'] },
  { icon: 'shopping_cart', category: 'work', words: ['تسوق', 'سوق', 'شراء', 'اشتري', 'بقاله', 'مشتريات', 'طلبات'] },
  { icon: 'cleaning_services', category: 'work', words: ['تنظيف', 'نظف', 'ترتيب', 'رتب', 'غسيل', 'كنس', 'مسح'] },
  { icon: 'savings', category: 'work', words: ['ميزانيه', 'ادخار', 'توفير', 'راتب', 'فاتوره', 'فواتير', 'مصروف', 'حسابات'] },
  { icon: 'directions_car', category: 'work', words: ['سياره', 'بنزين', 'قياده', 'صيانه'] },

  { icon: 'family_restroom', category: 'spiritual', words: ['اهل', 'عائله', 'والده', 'والد', 'امي', 'ابوي', 'زياره', 'رحم', 'اولاد', 'ابناء', 'زوجه', 'اطفال'] },
  { icon: 'phone_iphone', category: 'health', words: ['جوال', 'هاتف', 'شاشه', 'سوشال', 'تويتر', 'انستا'] },
  { icon: 'park', category: 'health', words: ['حديقه', 'نزهه', 'زرع', 'نبات', 'شمس'] },
];

/** الأيقونة المحايدة لمهمة لم تُطابق شيئاً — خيرٌ من أيقونة تناقض نصّها. */
export const NEUTRAL_ICON = 'check_circle';

/** يطابق عنوان المهمة بالقواعد ويعيد `{icon, category}` أو `null`. */
export function classifyTitle(title) {
  const tokens = tokenize(title);
  if (!tokens.length) return null;
  for (const rule of RULES) {
    for (const token of tokens) {
      for (const word of rule.words) {
        if (tokenHas(token, word)) return { icon: rule.icon, category: rule.category };
      }
    }
  }
  return null;
}

export const iconFromTitle = (title) => classifyTitle(title)?.icon || null;
export const categoryFromTitle = (title) => classifyTitle(title)?.category || null;
