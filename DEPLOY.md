# النشر على Cloudflare

الطريقة هنا ثابتة ويُعاد استخدامها في أي مشروع لاحق: تُضبط بيانات الاعتماد **مرة واحدة**
على مستوى بيئة Claude Code السحابية، فتصبح متاحة في كل جلسة وكل مستودع دون إعادة إعداد.

---

## 1) إعداد لمرة واحدة (على مستوى البيئة، وليس المشروع)

كلا الخطوتين من نفس المكان: **قائمة البيئة السحابية في شريط العنوان ← Edit**.

### أ. السماح بالوصول الشبكي إلى Cloudflare

ضمن **Network access**، أضف هذه المضيفات تحت *Allowed domains*
(مع إبقاء خيار *Allow package managers* مفعّلاً):

```
api.cloudflare.com
dash.cloudflare.com
*.cloudflare.com
*.workers.dev
*.pages.dev
```

بدونها يفشل `wrangler` بالخطأ `connect_rejected` لأن سياسة الشبكة تحجب الاتصال.

### ب. إضافة بيانات الاعتماد

ضمن **Network secrets** (أو *API credentials* / متغيّرات البيئة في الإصدارات الأقدم)،
أضف متغيّرين:

| المتغيّر | القيمة |
|---|---|
| `CLOUDFLARE_API_TOKEN` | التوكن من الخطوة التالية |
| `CLOUDFLARE_ACCOUNT_ID` | معرّف الحساب من لوحة Cloudflare |

> لا تلصق التوكن في المحادثة — يُدخل في إعدادات البيئة فقط. تلتقطه الجلسة التالية تلقائياً،
> ويقرأه `wrangler` من متغيّرات البيئة دون أي تسجيل دخول تفاعلي.

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

بعد اكتمال ما سبق، من جذر المستودع:

```bash
npx wrangler whoami                 # تحقّق من أن التوكن يعمل
npm run deploy                      # النشر إلى الإنتاج
npm run preview                     # نشر نسخة معاينة على فرع منفصل
```

`npm run deploy` يختصر:

```bash
wrangler pages deploy . --project-name daily-tasks --branch main
```

ينشئ الأمر المشروع تلقائياً في أول مرة. العنوان الناتج: `https://daily-tasks.pages.dev`.

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

بيانات الاعتماد مضبوطة على مستوى البيئة، فالمطلوب في أي مستودع جديد:

1. انسخ `_headers` و`wrangler.jsonc` و`.assetsignore` وعدّل `name` و`--project-name`.
2. أعد حساب تجزئة الـ CSP إن وُجد سكربت مضمّن، أو احذف سطر `Content-Security-Policy`.
3. `npm run deploy`.

لا حاجة لتوكن جديد ولا لتعديل سياسة الشبكة مرة أخرى.
