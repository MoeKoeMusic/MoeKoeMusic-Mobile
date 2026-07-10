import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { QrCodeView } from '@/components/ui/qr-code-view';
import { showToast } from '@/components/ui/toast';
import {
  describeApiFailure,
  describeAuthError,
  isApiSuccess,
  isValidPhone,
  maskPhone,
  readAccountOptions,
  readSsaChallenge,
  readThrownApiBody,
  type KugouAccountOption,
  type SsaChallenge,
} from '@/features/account/auth';
import { usePalette } from '@/hooks/use-palette';
import { pickNumber, pickText, toRecord } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

type Notice = {
  text: string;
  tone: 'info' | 'error';
};

type LoginMode = 'sms' | 'password' | 'qr';

type QrState = {
  phase: 'loading' | 'ready' | 'scanned' | 'expired' | 'error';
  url?: string;
  nickname?: string;
};

type SsaVerifyState =
  | { type: 'sms'; challenge: SsaChallenge }
  | { type: 'tencent'; challenge: SsaChallenge; txAppId: string };

type TencentCaptchaResult = {
  ticket: string;
  randstr: string;
};

type TencentCaptchaMessage =
  | ({ type: 'success' } & TencentCaptchaResult)
  | { type: 'ready' }
  | { type: 'cancel'; ret?: number }
  | { type: 'error'; message?: string };

const LOGIN_MODES: { key: LoginMode; label: string }[] = [
  { key: 'sms', label: '验证码登录' },
  { key: 'password', label: '密码登录' },
  { key: 'qr', label: '扫码登录' },
];

const MODE_SUBTITLES: Record<LoginMode, string> = {
  sms: '使用酷狗账号手机验证码登录',
  password: '使用酷狗账号密码登录，可能需要短信二次验证',
  qr: '使用酷狗音乐 App 扫码授权登录',
};

const QR_LOGIN_URL_PREFIX = 'https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type PaletteShape = ReturnType<typeof usePalette>;

function buildTencentCaptchaHtml(appId: string) {
  const appIdLiteral = JSON.stringify(appId).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #status {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #7b8194;
      font-size: 13px;
      background: #fff;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(255, 79, 137, 0.18);
      border-top-color: #ff4f89;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #tcaptcha_transform_dy,
    [id^="tcaptcha_transform"],
    .tcaptcha_transform {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      opacity: 1 !important;
      overflow: hidden !important;
      transform: none !important;
      background: #fff !important;
    }
    #tcaptcha_transform_dy iframe,
    [id^="tcaptcha_transform"] iframe,
    .tcaptcha_transform iframe {
      width: 100% !important;
      height: 100% !important;
      border: 0 !important;
      display: block !important;
    }
  </style>
</head>
<body>
  <div id="status">
    <div class="spinner"></div>
    <div id="statusText">正在打开安全验证...</div>
  </div>
  <script>
    (function () {
      var appId = ${appIdLiteral};
      var statusText = document.getElementById('statusText');

      function post(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function setStatus(text) {
        statusText.textContent = text;
      }

      function fail(message) {
        setStatus(message);
        post({ type: 'error', message: message });
      }

      function loadScript(src, onload, onerror) {
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = onload;
        script.onerror = onerror;
        document.head.appendChild(script);
      }

      function openCaptcha() {
        if (!window.TencentCaptcha) {
          fail('腾讯验证码加载失败');
          return;
        }

        try {
          var captcha = new window.TencentCaptcha(
            appId,
            function (res) {
              if (Number(res && res.ret) === 0 && res.ticket && res.randstr) {
                post({
                  type: 'success',
                  ticket: res.ticket,
                  randstr: res.randstr
                });
                return;
              }

              post({ type: 'cancel', ret: res && res.ret });
            },
            { type: '', showHeader: false }
          );

          post({ type: 'ready' });
          captcha.show();
        } catch (error) {
          fail(error && error.message ? error.message : '腾讯验证码打开失败');
        }
      }

      loadScript(
        'https://turing.captcha.qcloud.com/TCaptcha.js',
        openCaptcha,
        function () {
          fail('腾讯验证码加载失败');
        }
      );
    })();
  </script>
</body>
</html>`;
}

function InputShell({
  palette,
  focused,
  children,
}: {
  palette: PaletteShape;
  focused: boolean;
  children: ReactNode;
}) {
  return (
    <XStack
      alignItems="center"
      gap={10}
      height={52}
      paddingHorizontal={16}
      borderRadius={16}
      backgroundColor={palette.card}
      borderWidth={1}
      borderColor={focused ? palette.accentBorder : palette.border}>
      {children}
    </XStack>
  );
}

function GradientButton({
  palette,
  label,
  busy,
  disabled,
  onPress,
}: {
  palette: PaletteShape;
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <XStack
      height={52}
      borderRadius={26}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      opacity={disabled && !busy ? 0.55 : 1}
      transition="quickest"
      pressStyle={{ scale: 0.98, opacity: 0.85 }}
      onPress={() => {
        if (!disabled && !busy) {
          onPress();
        }
      }}>
      <LinearGradient
        colors={[palette.gradientStart, palette.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {busy ? (
        <Spinner size="small" color="#FFFFFF" />
      ) : (
        <Text color="#FFFFFF" fontSize={15.5} fontWeight="700" letterSpacing={1}>
          {label}
        </Text>
      )}
    </XStack>
  );
}

function TencentCaptchaModal({
  visible,
  palette,
  txAppId,
  run,
  failed,
  busy,
  topInset,
  bottomInset,
  onRetry,
  onClose,
  onSuccess,
  onCancel,
  onError,
}: {
  visible: boolean;
  palette: PaletteShape;
  txAppId: string;
  run: number;
  failed: boolean;
  busy: boolean;
  topInset: number;
  bottomInset: number;
  onRetry: () => void;
  onClose: () => void;
  onSuccess: (result: TencentCaptchaResult) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const html = useMemo(() => buildTencentCaptchaHtml(txAppId), [txAppId]);

  function handleMessage(event: WebViewMessageEvent) {
    if (busy) {
      return;
    }

    let message: TencentCaptchaMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as TencentCaptchaMessage;
    } catch {
      onError('安全验证返回异常');
      return;
    }

    if (message.type === 'success') {
      if (message.ticket && message.randstr) {
        onSuccess({ ticket: message.ticket, randstr: message.randstr });
      } else {
        onError('安全验证返回异常');
      }
      return;
    }

    if (message.type === 'cancel') {
      onCancel();
      return;
    }

    if (message.type === 'error') {
      onError(message.message || '腾讯验证码加载失败');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View
        flex={1}
        backgroundColor={palette.background}
        paddingTop={(Platform.OS === 'android' ? topInset : 0) + 10}
        paddingBottom={bottomInset + 16}>
        <XStack height={44} alignItems="center" paddingHorizontal={18}>
          <XStack
            width={36}
            height={36}
            borderRadius={18}
            alignItems="center"
            justifyContent="center"
            backgroundColor={palette.cardAlt}
            opacity={busy ? 0.55 : 1}
            transition="quickest"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => {
              if (!busy) {
                onClose();
              }
            }}>
            <Ionicons name="close" size={19} color={palette.textSecondary} />
          </XStack>
          <Text flex={1} color={palette.text} fontSize={15} fontWeight="700" textAlign="center">
            滑块安全验证
          </Text>
          <View width={36} />
        </XStack>

        {failed ? (
          <YStack flex={1} alignItems="center" justifyContent="center" gap={14} padding={28}>
            <XStack
              width={52}
              height={52}
              borderRadius={26}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.cardAlt}>
              <Ionicons name="alert-circle-outline" size={28} color={palette.danger} />
            </XStack>
            <YStack alignItems="center" gap={6}>
              <Text color={palette.text} fontSize={16} fontWeight="700">
                滑块验证未完成
              </Text>
              <Text color={palette.textTertiary} fontSize={12.5} textAlign="center" lineHeight={18}>
                请重新打开验证码后继续验证
              </Text>
            </YStack>
            <YStack width="100%" maxWidth={360} gap={10} marginTop={12}>
              <GradientButton
                palette={palette}
                label="重新打开验证"
                busy={false}
                disabled={busy}
                onPress={onRetry}
              />
              <XStack
                height={44}
                alignItems="center"
                justifyContent="center"
                borderRadius={16}
                backgroundColor={palette.cardAlt}
                transition="quickest"
                pressStyle={{ opacity: 0.6 }}
                onPress={onClose}>
                <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                  返回重新登录
                </Text>
              </XStack>
            </YStack>
          </YStack>
        ) : (
          <View flex={1} marginTop={8} backgroundColor={palette.background}>
            <WebView
              key={`${txAppId}-${run}`}
              originWhitelist={['*']}
              source={{ html, baseUrl: 'https://turing.captcha.qcloud.com/' }}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              scrollEnabled={false}
              onMessage={handleMessage}
              onError={() => onError('腾讯验证码加载失败')}
              style={styles.captchaWebView}
            />

            {busy ? (
              <YStack
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                alignItems="center"
                justifyContent="center"
                gap={10}
                backgroundColor="rgba(255, 255, 255, 0.82)">
                <Spinner size="large" color={palette.accent} />
                <Text color="#6E7386" fontSize={13.5} fontWeight="600">
                  正在提交验证...
                </Text>
              </YStack>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

export default function LoginScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<LoginMode>('sms');
  const [notice, setNotice] = useState<Notice | null>(null);

  // 验证码登录
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [accountOptions, setAccountOptions] = useState<KugouAccountOption[] | null>(null);
  const [pendingUserid, setPendingUserid] = useState<string | null>(null);

  // 密码登录
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [accountFocused, setAccountFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoggingIn, setPasswordLoggingIn] = useState(false);
  const [ssa, setSsa] = useState<SsaVerifyState | null>(null);
  const [ssaCode, setSsaCode] = useState('');
  const [ssaCodeFocused, setSsaCodeFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [captchaRun, setCaptchaRun] = useState(0);
  const [captchaFailed, setCaptchaFailed] = useState(false);

  // 扫码登录
  const [qrState, setQrState] = useState<QrState>({ phase: 'loading' });
  const qrRunRef = useRef(0);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (mode !== 'qr') {
      return;
    }

    const run = qrRunRef.current + 1;
    qrRunRef.current = run;
    void startQrLogin(run);

    return () => {
      // 离开扫码方式或卸载页面时使进行中的轮询失效
      qrRunRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function switchMode(next: LoginMode) {
    if (next === mode) {
      return;
    }

    setMode(next);
    setNotice(null);
    setAccountOptions(null);
    setPendingUserid(null);
    setSsa(null);
    setSsaCode('');
    setCaptchaFailed(false);
  }

  function finishLogin() {
    showToast('登录成功');
    router.back();
  }

  async function handleSendCode() {
    const mobile = phone.trim();
    if (!isValidPhone(mobile)) {
      setNotice({ text: '请输入正确的 11 位手机号', tone: 'error' });
      return;
    }

    setSendingCode(true);
    setNotice(null);

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.captcha_sent({ mobile });
      if (!isApiSuccess(response.body)) {
        throw new Error(describeApiFailure(response.body, '验证码发送失败'));
      }

      setCountdown(60);
      setNotice({ text: `验证码已发送至 ${maskPhone(mobile)}`, tone: 'info' });
    } catch (error) {
      setNotice({ text: describeAuthError(error, '验证码发送失败'), tone: 'error' });
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSmsLogin(selectedUserid?: string) {
    const mobile = phone.trim();
    const verifyCode = code.trim();

    if (!isValidPhone(mobile)) {
      setNotice({ text: '请输入正确的 11 位手机号', tone: 'error' });
      return;
    }

    if (verifyCode.length < 4) {
      setNotice({ text: '请输入收到的短信验证码', tone: 'error' });
      return;
    }

    setLoggingIn(true);
    setPendingUserid(selectedUserid ?? null);
    setNotice(null);

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.login_cellphone({
        mobile,
        code: verifyCode,
        ...(selectedUserid ? { userid: selectedUserid } : {}),
      });
      if (!isApiSuccess(response.body)) {
        throw response;
      }

      finishLogin();
      return;
    } catch (error) {
      const body = readThrownApiBody(error);
      const options = body ? readAccountOptions(body) : [];
      if (options.length > 0 && !selectedUserid) {
        // 一个手机号绑定多个账号：先选择要登录的账号，再带 userid 重试
        setAccountOptions(options);
        setNotice({ text: '该手机号绑定了多个账号，请选择要登录的账号', tone: 'info' });
        return;
      }

      setNotice({ text: describeAuthError(error, '登录失败'), tone: 'error' });
    } finally {
      setLoggingIn(false);
      setPendingUserid(null);
    }
  }

  async function handlePasswordLogin(afterVerify = false) {
    const username = account.trim();

    if (!username) {
      setNotice({ text: '请输入手机号 / 邮箱账号', tone: 'error' });
      return;
    }

    if (!password) {
      setNotice({ text: '请输入密码', tone: 'error' });
      return;
    }

    setPasswordLoggingIn(true);
    setNotice(null);

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.login({ username, password });
      if (!isApiSuccess(response.body)) {
        throw response;
      }

      finishLogin();
      return;
    } catch (error) {
      const body = readThrownApiBody(error);

      // 密码登录可能触发二次安全验证（错误码 20028），验证通过后重试一次
      const challenge = body ? readSsaChallenge(body) : null;
      if (challenge && !afterVerify) {
        await resolveSsaChallenge(challenge);
        return;
      }

      if (body && readAccountOptions(body).length > 0) {
        setNotice({ text: '该账号绑定了多个用户，请改用「验证码登录」选择账号', tone: 'error' });
        return;
      }

      setNotice({
        text: describeAuthError(error, afterVerify ? '验证已通过，但登录失败，请重试' : '登录失败'),
        tone: 'error',
      });
    } finally {
      setPasswordLoggingIn(false);
    }
  }

  /** 查询二次验证方式：32 = 短信验证码（页面内完成），23 = 腾讯滑块。 */
  async function resolveSsaChallenge(challenge: SsaChallenge) {
    try {
      const response = await mobileApi.get_verify_info({ eventid: challenge.eventId });
      const data = toRecord(toRecord(response.body).data);
      const verifyType = pickNumber(data.v_type);

      if (verifyType === 32) {
        setSsa({ type: 'sms', challenge });
        setSsaCode('');
        setCaptchaFailed(false);
        setNotice({ text: '酷狗已向该账号绑定的手机发送短信验证码', tone: 'info' });
        return;
      }

      if (verifyType === 23) {
        const txAppId = pickText(data.txappid);
        if (!txAppId) {
          throw new Error('缺少腾讯验证码配置');
        }

        setSsa({ type: 'tencent', challenge, txAppId });
        setCaptchaFailed(false);
        setCaptchaRun((value) => value + 1);
        setNotice({ text: '请完成滑块安全验证', tone: 'info' });
        return;
      }

      setNotice({
        text: `暂不支持该验证方式（类型 ${verifyType || '未知'}），请改用「验证码登录」`,
        tone: 'error',
      });
    } catch (error) {
      setNotice({ text: describeAuthError(error, '获取安全验证信息失败'), tone: 'error' });
    }
  }

  async function handleVerifySsa() {
    if (ssa?.type !== 'sms') {
      return;
    }

    const verifyCode = ssaCode.trim();
    if (verifyCode.length < 4) {
      setNotice({ text: '请输入收到的短信验证码', tone: 'error' });
      return;
    }

    setVerifying(true);
    setNotice(null);

    try {
      const response = await mobileApi.verify_user_info({
        eventid: ssa.challenge.eventId,
        v_type: 32,
        verifycode: verifyCode,
        sid: ssa.challenge.sid,
        edt: ssa.challenge.edt,
      });
      if (!isApiSuccess(response.body)) {
        throw response;
      }

      setSsa(null);
      setSsaCode('');
      await handlePasswordLogin(true);
    } catch (error) {
      setNotice({ text: describeAuthError(error, '安全验证失败'), tone: 'error' });
    } finally {
      setVerifying(false);
    }
  }

  async function handleVerifyTencentCaptcha(result: TencentCaptchaResult) {
    if (ssa?.type !== 'tencent') {
      return;
    }

    setVerifying(true);
    setCaptchaFailed(false);
    setNotice(null);

    try {
      const verifycode = `KGCodeTX|${JSON.stringify({
        ticket: result.ticket,
        randstr: result.randstr,
        txappid: ssa.txAppId,
      })}`;

      const response = await mobileApi.verify_user_info({
        eventid: ssa.challenge.eventId,
        v_type: 23,
        verifycode,
        sid: ssa.challenge.sid,
        edt: ssa.challenge.edt,
      });
      if (!isApiSuccess(response.body)) {
        throw response;
      }

      setSsa(null);
      await handlePasswordLogin(true);
    } catch (error) {
      setCaptchaFailed(true);
      setNotice({ text: describeAuthError(error, '安全验证失败'), tone: 'error' });
    } finally {
      setVerifying(false);
    }
  }

  function handleTencentCaptchaFailure(message: string) {
    if (verifying) {
      return;
    }

    setCaptchaFailed(true);
    setNotice({ text: message, tone: 'error' });
  }

  function retryTencentCaptcha() {
    if (verifying || passwordLoggingIn) {
      return;
    }

    setCaptchaFailed(false);
    setCaptchaRun((value) => value + 1);
    setNotice(null);
  }

  function closeTencentCaptcha() {
    if (verifying || passwordLoggingIn) {
      return;
    }

    setSsa(null);
    setCaptchaFailed(false);
    setNotice(null);
  }

  async function startQrLogin(run: number) {
    const isStale = () => qrRunRef.current !== run;

    setNotice(null);
    setQrState({ phase: 'loading' });

    try {
      await bootstrapMobileApi();
      const keyResponse = await mobileApi.login_qr_key();
      if (isStale()) {
        return;
      }
      if (!isApiSuccess(keyResponse.body)) {
        throw new Error(describeApiFailure(keyResponse.body, '二维码生成失败'));
      }

      const key = pickText(toRecord(toRecord(keyResponse.body).data).qrcode);
      if (!key) {
        throw new Error('二维码生成失败');
      }

      setQrState({ phase: 'ready', url: `${QR_LOGIN_URL_PREFIX}${key}` });

      // 轮询扫码状态：0 过期 / 1 等待 / 2 已扫码待确认 / 4 登录成功（token 由会话层自动落库）
      let failures = 0;
      while (!isStale()) {
        await wait(2000);
        if (isStale()) {
          return;
        }

        try {
          const checkResponse = await mobileApi.login_qr_check({ key });
          if (isStale()) {
            return;
          }

          failures = 0;
          const data = toRecord(toRecord(checkResponse.body).data);
          const status = pickNumber(data.status);

          if (status === 4) {
            finishLogin();
            return;
          }

          if (status === 2) {
            const nickname = pickText(data.nickname);
            setQrState((prev) => ({ ...prev, phase: 'scanned', nickname }));
          } else if (status === 0) {
            setQrState((prev) => ({ ...prev, phase: 'expired' }));
            return;
          }
        } catch {
          failures += 1;
          if (failures >= 3) {
            if (!isStale()) {
              setQrState((prev) => ({ ...prev, phase: 'error' }));
            }
            return;
          }
        }
      }
    } catch (error) {
      if (isStale()) {
        return;
      }

      setQrState({ phase: 'error' });
      setNotice({ text: describeAuthError(error, '二维码生成失败'), tone: 'error' });
    }
  }

  function refreshQr() {
    const run = qrRunRef.current + 1;
    qrRunRef.current = run;
    void startQrLogin(run);
  }

  const canSubmitSms = isValidPhone(phone.trim()) && code.trim().length >= 4 && !loggingIn;
  const canSubmitPassword = Boolean(account.trim() && password) && !passwordLoggingIn;
  const canSubmitSsa = ssa?.type === 'sms' && ssaCode.trim().length >= 4 && !verifying;

  const qrTip =
    qrState.phase === 'loading'
      ? '正在生成二维码…'
      : qrState.phase === 'ready'
        ? '打开酷狗音乐 App，扫一扫登录'
        : qrState.phase === 'scanned'
          ? '已扫码，请在手机上确认登录'
          : qrState.phase === 'expired'
            ? '二维码已过期，请刷新后重新扫码'
            : '二维码状态获取失败，请刷新重试';

  return (
    <View flex={1} backgroundColor={palette.background}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 14,
              paddingBottom: insets.bottom + 28,
            },
          ]}>
          <XStack justifyContent="flex-end">
            <XStack
              width={36}
              height={36}
              borderRadius={18}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.cardAlt}
              transition="quickest"
              pressStyle={{ opacity: 0.6, scale: 0.92 }}
              onPress={() => router.back()}>
              <Ionicons name="close" size={19} color={palette.textSecondary} />
            </XStack>
          </XStack>

          <YStack alignItems="center" gap={14} marginTop={20}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.brandIcon}
              contentFit="cover"
            />
            <YStack alignItems="center" gap={6}>
              <Text color={palette.text} fontSize={23} fontWeight="800" letterSpacing={0.4}>
                登录 MoeKoe
              </Text>
              <Text color={palette.textTertiary} fontSize={13}>
                {MODE_SUBTITLES[mode]}
              </Text>
            </YStack>
          </YStack>

          <XStack backgroundColor={palette.cardAlt} borderRadius={14} padding={3} marginTop={26}>
            {LOGIN_MODES.map((item) => {
              const active = mode === item.key;
              return (
                <XStack
                  key={item.key}
                  flex={1}
                  height={38}
                  borderRadius={11}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={active ? palette.card : 'transparent'}
                  transition="quickest"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() => switchMode(item.key)}>
                  <Text
                    color={active ? palette.accent : palette.textSecondary}
                    fontSize={13.5}
                    fontWeight={active ? '700' : '600'}>
                    {item.label}
                  </Text>
                </XStack>
              );
            })}
          </XStack>

          {mode === 'sms' && !accountOptions ? (
            <YStack gap={12} marginTop={24}>
              <InputShell palette={palette} focused={phoneFocused}>
                <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                  +86
                </Text>
                <View
                  width={StyleSheet.hairlineWidth}
                  height={18}
                  backgroundColor={palette.border}
                />
                <TextInput
                  value={phone}
                  onChangeText={(value) => setPhone(value.replace(/[^\d]/g, '').slice(0, 11))}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  placeholder="手机号"
                  placeholderTextColor={palette.textTertiary}
                  keyboardType="number-pad"
                  textContentType="telephoneNumber"
                  multiline={false}
                  scrollEnabled={false}
                  editable={!loggingIn}
                  style={[styles.input, { color: palette.text }]}
                />
              </InputShell>

              <XStack gap={10}>
                <XStack
                  flex={1}
                  alignItems="center"
                  height={52}
                  paddingHorizontal={16}
                  borderRadius={16}
                  backgroundColor={palette.card}
                  borderWidth={1}
                  borderColor={codeFocused ? palette.accentBorder : palette.border}>
                  <TextInput
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/[^\d]/g, '').slice(0, 8))}
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                    placeholder="验证码"
                    placeholderTextColor={palette.textTertiary}
                    keyboardType="number-pad"
                    multiline={false}
                    scrollEnabled={false}
                    editable={!loggingIn}
                    style={[styles.input, { color: palette.text }]}
                  />
                </XStack>
                <XStack
                  minWidth={104}
                  height={52}
                  paddingHorizontal={16}
                  borderRadius={16}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accentSoft}
                  opacity={countdown > 0 || sendingCode || loggingIn ? 0.55 : 1}
                  transition="quickest"
                  pressStyle={{ opacity: 0.5, scale: 0.97 }}
                  onPress={() => {
                    if (countdown <= 0 && !sendingCode && !loggingIn) {
                      void handleSendCode();
                    }
                  }}>
                  {sendingCode ? (
                    <Spinner size="small" color={palette.accent} />
                  ) : (
                    <Text color={palette.accent} fontSize={13.5} fontWeight="700">
                      {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                    </Text>
                  )}
                </XStack>
              </XStack>

              <YStack marginTop={8}>
                <GradientButton
                  palette={palette}
                  label="登录"
                  busy={loggingIn}
                  disabled={!canSubmitSms}
                  onPress={() => void handleSmsLogin()}
                />
              </YStack>
            </YStack>
          ) : null}

          {mode === 'sms' && accountOptions ? (
            <YStack gap={10} marginTop={24}>
              {accountOptions.map((option) => {
                const avatarUrl = sizedImage(option.pic, 120);
                const busy = pendingUserid === option.userid && loggingIn;
                return (
                  <XStack
                    key={option.userid}
                    alignItems="center"
                    gap={12}
                    padding={12}
                    borderRadius={16}
                    backgroundColor={palette.card}
                    borderWidth={1}
                    borderColor={palette.border}
                    opacity={loggingIn && !busy ? 0.55 : 1}
                    transition="quickest"
                    pressStyle={{ opacity: 0.7, scale: 0.99 }}
                    onPress={() => {
                      if (!loggingIn) {
                        void handleSmsLogin(option.userid);
                      }
                    }}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.accountAvatar} />
                    ) : (
                      <XStack
                        width={44}
                        height={44}
                        borderRadius={22}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={palette.cardAlt}>
                        <Ionicons name="person" size={20} color={palette.textTertiary} />
                      </XStack>
                    )}
                    <YStack flex={1} gap={3}>
                      <Text color={palette.text} fontSize={14.5} fontWeight="700" numberOfLines={1}>
                        {option.nickname || '未命名用户'}
                      </Text>
                      <Text color={palette.textTertiary} fontSize={12}>
                        UID {option.userid}
                        {option.grade ? ` · Lv.${option.grade}` : ''}
                      </Text>
                    </YStack>
                    {busy ? (
                      <Spinner size="small" color={palette.accent} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
                    )}
                  </XStack>
                );
              })}

              <XStack
                height={44}
                alignItems="center"
                justifyContent="center"
                borderRadius={16}
                backgroundColor={palette.cardAlt}
                marginTop={4}
                transition="quickest"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => {
                  if (!loggingIn) {
                    setAccountOptions(null);
                    setNotice(null);
                  }
                }}>
                <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                  返回重新输入
                </Text>
              </XStack>
            </YStack>
          ) : null}

          {mode === 'password' && !ssa ? (
            <YStack gap={12} marginTop={24}>
              <InputShell palette={palette} focused={accountFocused}>
                <TextInput
                  value={account}
                  onChangeText={setAccount}
                  onFocus={() => setAccountFocused(true)}
                  onBlur={() => setAccountFocused(false)}
                  placeholder="手机号 / 邮箱账号"
                  placeholderTextColor={palette.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  multiline={false}
                  scrollEnabled={false}
                  editable={!passwordLoggingIn}
                  style={[styles.input, { color: palette.text }]}
                />
              </InputShell>

              <InputShell palette={palette} focused={passwordFocused}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="密码"
                  placeholderTextColor={palette.textTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  multiline={false}
                  scrollEnabled={false}
                  editable={!passwordLoggingIn}
                  style={[styles.input, { color: palette.text }]}
                />
                <XStack
                  padding={6}
                  transition="quickest"
                  pressStyle={{ opacity: 0.5 }}
                  onPress={() => setShowPassword((value) => !value)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={palette.textTertiary}
                  />
                </XStack>
              </InputShell>

              <YStack marginTop={8}>
                <GradientButton
                  palette={palette}
                  label="登录"
                  busy={passwordLoggingIn}
                  disabled={!canSubmitPassword}
                  onPress={() => void handlePasswordLogin()}
                />
              </YStack>
            </YStack>
          ) : null}

          {mode === 'password' && ssa?.type === 'sms' ? (
            <YStack gap={12} marginTop={24}>
              <YStack alignItems="center" gap={8} marginBottom={4}>
                <XStack
                  width={44}
                  height={44}
                  borderRadius={22}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accentSoft}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={palette.accent} />
                </XStack>
                <Text color={palette.text} fontSize={15} fontWeight="700">
                  短信安全验证
                </Text>
                <Text color={palette.textTertiary} fontSize={12.5} textAlign="center">
                  请输入酷狗发送至该账号绑定手机的验证码
                </Text>
              </YStack>

              <InputShell palette={palette} focused={ssaCodeFocused}>
                <TextInput
                  value={ssaCode}
                  onChangeText={(value) => setSsaCode(value.replace(/[^\d]/g, '').slice(0, 8))}
                  onFocus={() => setSsaCodeFocused(true)}
                  onBlur={() => setSsaCodeFocused(false)}
                  placeholder="短信验证码"
                  placeholderTextColor={palette.textTertiary}
                  keyboardType="number-pad"
                  multiline={false}
                  scrollEnabled={false}
                  editable={!verifying}
                  style={[styles.input, { color: palette.text }]}
                />
              </InputShell>

              <YStack marginTop={8} gap={10}>
                <GradientButton
                  palette={palette}
                  label="验证并登录"
                  busy={verifying || passwordLoggingIn}
                  disabled={!canSubmitSsa}
                  onPress={() => void handleVerifySsa()}
                />
                <XStack
                  height={44}
                  alignItems="center"
                  justifyContent="center"
                  borderRadius={16}
                  backgroundColor={palette.cardAlt}
                  transition="quickest"
                  pressStyle={{ opacity: 0.6 }}
                  onPress={() => {
                    if (!verifying && !passwordLoggingIn) {
                      setSsa(null);
                      setSsaCode('');
                      setCaptchaFailed(false);
                      setNotice(null);
                    }
                  }}>
                  <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                    返回重新登录
                  </Text>
                </XStack>
              </YStack>
            </YStack>
          ) : null}

          {mode === 'qr' ? (
            <YStack alignItems="center" gap={16} marginTop={28}>
              <View position="relative">
                {qrState.url ? (
                  <QrCodeView value={qrState.url} size={228} />
                ) : (
                  <View
                    width={228}
                    height={228}
                    borderRadius={18}
                    backgroundColor={palette.card}
                    borderWidth={1}
                    borderColor={palette.border}
                    alignItems="center"
                    justifyContent="center">
                    <Spinner size="large" color={palette.accent} />
                  </View>
                )}

                {qrState.phase === 'scanned' ||
                qrState.phase === 'expired' ||
                qrState.phase === 'error' ? (
                  <YStack
                    position="absolute"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    borderRadius={18}
                    backgroundColor="rgba(255, 255, 255, 0.94)"
                    alignItems="center"
                    justifyContent="center"
                    gap={10}>
                    {qrState.phase === 'scanned' ? (
                      <>
                        <Ionicons name="checkmark-circle" size={44} color={palette.accent} />
                        <YStack alignItems="center" gap={4}>
                          <Text color="#12131F" fontSize={14.5} fontWeight="700">
                            {qrState.nickname ? `${qrState.nickname} 已扫码` : '已扫码'}
                          </Text>
                          <Text color="#6E7386" fontSize={12.5}>
                            请在酷狗音乐 App 上确认登录
                          </Text>
                        </YStack>
                      </>
                    ) : (
                      <>
                        <Text color="#12131F" fontSize={14.5} fontWeight="700">
                          {qrState.phase === 'expired' ? '二维码已过期' : '二维码状态获取失败'}
                        </Text>
                        <XStack
                          height={38}
                          paddingHorizontal={18}
                          borderRadius={19}
                          alignItems="center"
                          justifyContent="center"
                          gap={6}
                          backgroundColor={palette.accent}
                          transition="quickest"
                          pressStyle={{ opacity: 0.8, scale: 0.97 }}
                          onPress={refreshQr}>
                          <Ionicons name="refresh" size={15} color="#FFFFFF" />
                          <Text color="#FFFFFF" fontSize={13} fontWeight="700">
                            刷新二维码
                          </Text>
                        </XStack>
                      </>
                    )}
                  </YStack>
                ) : null}
              </View>

              <Text color={palette.textTertiary} fontSize={12.5} textAlign="center">
                {qrTip}
              </Text>
            </YStack>
          ) : null}

          <XStack minHeight={20} justifyContent="center" alignItems="center" marginTop={12}>
            {notice ? (
              <Text
                color={notice.tone === 'error' ? palette.danger : palette.textTertiary}
                fontSize={12.5}
                textAlign="center">
                {notice.text}
              </Text>
            ) : null}
          </XStack>

          <YStack flex={1} justifyContent="flex-end" alignItems="center" marginTop={30}>
            <Text color={palette.textTertiary} fontSize={11} textAlign="center" lineHeight={17}>
              登录凭证仅保存在本机安全存储，用于同步你的酷狗账号数据
            </Text>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>

      {ssa?.type === 'tencent' ? (
        <TencentCaptchaModal
          visible={mode === 'password'}
          palette={palette}
          txAppId={ssa.txAppId}
          run={captchaRun}
          failed={captchaFailed}
          busy={verifying || passwordLoggingIn}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onRetry={retryTencentCaptcha}
          onClose={closeTencentCaptcha}
          onSuccess={(result) => void handleVerifyTencentCaptcha(result)}
          onCancel={() => handleTencentCaptchaFailure('已取消滑块安全验证')}
          onError={handleTencentCaptchaFailure}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 26,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15.5,
    fontWeight: '500',
    lineHeight: 20,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  captchaWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
