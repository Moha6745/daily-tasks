/**
 * غلاف Expo لتطبيق «تحدي الـ 30».
 *
 * التطبيق نفسه ويب (PWA) ولا شيء منه مكتوب بـ React Native، فوظيفة هذا
 * الغلاف واحدة: فتح الموقع في WebView يملأ الشاشة كي يعمل في Expo Go على
 * الهاتف. لا منطق للمهام هنا ولا تخزين — كلّه يبقى في الويب كما هو.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { APP_URL, SHELL_BG } from './config';

/** أصل العنوان، لتمييز ملاحة التطبيق من رابط خارجي. */
const APP_ORIGIN = (() => {
  const m = /^[a-z]+:\/\/[^/]+/i.exec(APP_URL);
  return m ? m[0] : APP_URL;
})();

/**
 * جسر المظهر: شريط الحالة ناتيف فلا تبلغه أنماط CSS، فيخبرنا الويب بمظهره
 * الحالي ليوافقه لون الكتابة في الشريط. يُراقَب `data-theme` لأن تغيير
 * المظهر من الإعدادات لا يُعيد تحميل الصفحة.
 */
const THEME_BRIDGE = `(function(){
  function send(){
    try {
      var chosen = document.documentElement.dataset.theme;
      var theme = chosen === 'dark' || chosen === 'light'
        ? chosen
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'theme', theme: theme }));
    } catch (e) {}
  }
  send();
  new MutationObserver(send).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', send);
})();
true;`;

export default function App() {
  const webRef = useRef(null);
  const canGoBack = useRef(false);
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const bg = SHELL_BG[theme];

  /* زرّ الرجوع في أندرويد يتنقّل في تاريخ الويب قبل أن يُغلق التطبيق. */
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      webRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'theme') setTheme(data.theme === 'dark' ? 'dark' : 'light');
    } catch (e) {
      /* رسائل أخرى من الصفحة لا تخصّ الغلاف */
    }
  }, []);

  /* الروابط الخارجية تُفتح في متصفّح النظام لا داخل التطبيق. */
  const onShouldStartLoad = useCallback((request) => {
    const { url, isTopFrame } = request;
    if (isTopFrame === false) return true;
    if (!/^https?:/i.test(url)) return true;
    if (url.startsWith(APP_ORIGIN)) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        style={[styles.web, { backgroundColor: bg }]}
        originWhitelist={['http://*', 'https://*']}
        applicationNameForUserAgent="Tahaddi30Shell/1.0"
        injectedJavaScript={THEME_BRIDGE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        onNavigationStateChange={(nav) => { canGoBack.current = nav.canGoBack; }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) { setLoading(false); setFailed(true); }
        }}
        /* مواقيت الصلاة والقبلة تحتاج الموقع، والإذن يطلبه النظام مرّة. */
        geolocationEnabled
        /* لا ارتداد مطّاطي عند الحدود: التطبيق يُمسك تمريره بنفسه. */
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
      />

      {loading && !failed ? (
        <View style={[styles.cover, { backgroundColor: bg }]} pointerEvents="none">
          <ActivityIndicator size="large" color={theme === 'dark' ? '#99d3ba' : '#0f4c3a'} />
        </View>
      ) : null}

      {failed ? (
        <View style={[styles.cover, { backgroundColor: bg }]}>
          <Text style={[styles.title, { color: theme === 'dark' ? '#e4ece7' : '#131b2e' }]}>
            تعذّر فتح التطبيق
          </Text>
          <Text style={[styles.body, { color: theme === 'dark' ? '#a9b8b0' : '#404944' }]}>
            تحقّق من اتصال الشبكة ثم أعد المحاولة.
          </Text>
          <Pressable
            onPress={retry}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  web: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  body: { fontSize: 15, textAlign: 'center', writingDirection: 'rtl' },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: '#0f4c3a',
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
