# النشر على Cloudflare

الطريقة هنا ثابتة ويُعاد استخدامها في أي مشروع لاحق: تُضبط بيانات الاعتماد **مرة واحدة**
على مستوى بيئة Claude Code السحابية، فتصبح متاحة في كل جلسة وكل مستودع دون إعادة إعداد.

---

## 1) إعداد لمرة واحدة (على مستوى البيئة، وليس المشروع)

كلا الخطوتين داخل نافذة واحدة. للوصول إليها على **claude.ai/code**:

> اضغط **أيقونة السحابة** التي تحمل اسم البيئة الحالية، في الصف **فوق مربع الرسالة** مباشرة
> ← مرّر المؤشر على صف البيئة ← **أيقونة الترس** ← تُفتح نافذة **Edit environment**.

لا توجد صفحة إعدادات مستقلة ولا رابط مباشر لهذه النافذة؛ الوصول الوحيد من ذلك المحدِّد.

### أ. السماح بالوصول الشبكي إلى Cloudflare

في النافذة، حقل **Network access** ← اختر **Custom** ← يظهر حقل **Allowed domains**،
اكتب سطراً لكل نطاق:

```
api.cloudflare.com
*.cloudflare.com
*.pages.dev
```

مع إبقاء خيار تضمين النطاقات الافتراضية مفعّلاً حتى تبقى مدراء الحزم تعمل.

تغيير الشبكة يسري على الجلسات القائمة خلال دقيقة تقريباً — **لا يحتاج جلسة جديدة**.

### ب. إضافة بيانات الاعتماد

في نفس النافذة، قسم **Environment variables** (بصيغة `.env`)، أضف سطرين:

```
CLOUDFLARE_API_TOKEN=kZt4Np7QxR2mWvB8cL6yH3fJ9sD1gA5eT0uY2iO4
CLOUDFLARE_ACCOUNT_ID=8f3a1c7e9b2d4056a1e8c3f7b9d24a60
```

> القيمتان أعلاه **أمثلة وهمية** تبيّن الشكل فقط — استبدلهما بقيمك الحقيقية ولا تنسخهما.
> التوكن نحو ٤٠ محرفاً لاتينياً وأرقاماً، ومعرّف الحساب ٣٢ محرفاً ست عشرياً (`0-9` و`a-f`).
> إن احتوى أيٌّ منهما حرفاً عربياً أو مسافة فهو ليس القيمة الصحيحة.

> **لماذا هنا وليس في Network secrets؟**
> `Network secrets` تجعل الوكيل يحقن ترويسة المصادقة في الطلب الخارج دون أن ترى الجلسة قيمتها.
> لكن `wrangler` يقرأ التوكن من **متغيّر البيئة** ويبني الترويسة بنفسه، ويتوقف بخطأ
> «غير مسجّل الدخول» قبل أن يرسل أي طلب إن لم يجد المتغيّر. لذلك المتغيّرات هي الخيار العملي هنا.
>
> المقابل: أي جلسة تعمل في هذه البيئة تستطيع قراءة قيمة المتغيّر. لذا اجعل التوكن محدود
> الصلاحيات كما في الجدول أدناه، ويمكنك إبطاله من لوحة Cloudflare في أي وقت.

تغيير المتغيّرات **لا** يصل للجلسة الحالية مباشرة — يُقرأ عند إنشاء جلسة جديدة أو عند إعادة
تشغيل آلة الجلسة. فابدأ جلسة جديدة بعد إضافتها.

### ج. إنشاء التوكن في Cloudflare

**My Profile ← API Tokens ← Create Token ← Create Custom Token**، بهذه الصلاحيات:

| النطاق | الصلاحية | لماذا |
|---|---|---|
| Account | **Cloudflare Pages** → Edit | النشر على Pages |
| Account | **Workers Scripts** → Edit | مشاريع Workers المستقبلية |
| Account | **Account Settings** → Read | قراءة معرّف الحساب |
| User | **User Details** → Read | `wrangler whoami` |

أضف الصلاحيتين الأخيرتين حتى لو كان المشروع الحالي على Pages فقط، كي يصلح التوكن
نفسه لكل المشاريع القادمة دون إنشاء توكن جديد.

**معرّف الحساب**: لوحة Cloudflare ← أي موقع ← الشريط الجانبي، أو من عنوان URL للوحة:
`dash.cloudflare.com/<ACCOUNT_ID>`.

---

## 2) النشر

**الموقع الحيّ: <https://daily-tasks-a27.pages.dev>**

> اسم المشروع `daily-tasks`، لكن العنوان أخذ اللاحقة `-a27` لأن `daily-tasks.pages.dev`
> محجوز عالمياً من حساب آخر. نطاقات `pages.dev` مشتركة بين كل مستخدمي Cloudflare.

### ارفع ملفات الموقع فقط

لا تنشر من جذر المستودع مباشرة: Pages يرفع كل ما في المجلد، فتصل ملفات مثل
`package.json` و`DEPLOY.md` إلى الموقع العام. جهّز مجلداً مؤقتاً يحوي ملفات الموقع وحدها:

```bash
S=$(mktemp -d)/daily-tasks && mkdir -p "$S"
cp index.html manifest.webmanifest sw.js _headers "$S/" && cp -r assets "$S/"
cd "$S" && npx wrangler pages deploy . --project-name daily-tasks --branch main --commit-dirty=true
```

سمِّ المجلد باسم المشروع: `wrangler` يشتق أسماء افتراضية من اسم المجلد الحالي.

### أول مرة لكل مشروع جديد

ينشئ `wrangler` المشروع تلقائياً، لكنه يحوّل الطلب إلى نسخة Pages الجديدة (المدمجة في
Workers) ويفشل إن لم يكن للحساب نطاق `workers.dev` مسجّل. لتجاوز ذلك واستخدام Pages
الكلاسيكي الذي يعطي عنوان `*.pages.dev`:

```bash
npx wrangler pages project create daily-tasks --production-branch main --force
```

`--force` **لأول أمر فقط**؛ بعد وجود المشروع تعمل بقية الأوامر على Pages مباشرة بدونه.

### بعد النشر

```bash
npx wrangler whoami    # تحقّق من التوكن
```

ملف يُحذف من النشرة قد يبقى في ذاكرة حافة Cloudflare مدة قصيرة؛ تحقّق بكاسر تخزين مؤقت:
`curl "https://daily-tasks-a27.pages.dev/<path>?cb=$RANDOM"`.

---

## 3) ملفات الإعداد في المستودع

| الملف | الدور |
|---|---|
| `_headers` | رؤوس HTTP: سياسة أمان المحتوى، التحكم بالتخزين المؤقت، أذونات الموقع والحساسات |
| `wrangler.jsonc` | اسم المشروع ومجلد المخرجات |
| `.assetsignore` | ما لا يُرفع ضمن أصول الموقع |

### ملاحظات مهمة في `_headers`

- `Permissions-Policy` يسمح بـ `geolocation` و`gyroscope`/`accelerometer`/`magnetometer`
  لأن التطبيق يحتاجها لمواقيت الصلاة وبوصلة القبلة. **حذفها يعطّل هاتين الميزتين.**
- `Content-Security-Policy` يتضمّن تجزئة `sha256` للسكربت المضمّن في `index.html`
  (الذي يمنع وميض المظهر الفاتح). **عند تعديل ذلك السكربت يجب إعادة حساب التجزئة:**

  ```bash
  python3 -c "import re,hashlib,base64;s=open('index.html').read();\
  m=re.search(r'<script>(.*?)</script>',s,re.S);\
  print('sha256-'+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode())"
  ```

- `sw.js` و`index.html` بـ `no-cache` كي تصل التحديثات فوراً ولا يعلق المستخدم على
  نسخة قديمة من عامل الخدمة.

---

## 4) نطاق خاص (اختياري)

لوحة Cloudflare ← **Workers & Pages ← daily-tasks ← Custom domains ← Set up a domain**.
إن كان النطاق مُدار في Cloudflare تُضبط سجلات DNS وشهادة SSL تلقائياً؛ وإلا أضف سجل
`CNAME` يشير إلى `daily-tasks.pages.dev`.

بعد ربط النطاق، حدّث أصول OAuth إن فُعّل تسجيل الدخول:
- Google: *Authorized JavaScript origins*
- Apple: *Return URLs* وقيمة `appleRedirectURI` في `assets/js/config.js`

---

## 5) إعادة استخدام الطريقة في مشروع جديد

بيانات الاعتماد وسياسة الشبكة مضبوطة على مستوى البيئة، فالمطلوب في أي مستودع جديد:

1. انسخ `_headers` و`wrangler.jsonc` و`.assetsignore` وعدّل `name` و`--project-name`.
2. أعد حساب تجزئة الـ CSP إن وُجد سكربت مضمّن، أو احذف سطر `Content-Security-Policy`.
3. `npm run deploy`.

لا حاجة لتوكن جديد ولا لتعديل سياسة الشبكة مرة أخرى.
