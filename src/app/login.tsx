import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import {
  describeApiFailure,
  isApiSuccess,
  isValidPhone,
  maskPhone,
} from '@/features/account/auth';
import { usePalette } from '@/hooks/use-palette';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

type Notice = {
  text: string;
  tone: 'info' | 'error';
};

export default function LoginScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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
      setNotice({
        text: error instanceof Error ? error.message : '验证码发送失败',
        tone: 'error',
      });
    } finally {
      setSendingCode(false);
    }
  }

  async function handleLogin() {
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
    setNotice(null);

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.login_cellphone({ mobile, code: verifyCode });
      if (!isApiSuccess(response.body)) {
        throw new Error(describeApiFailure(response.body, '登录失败'));
      }

      router.back();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : '登录失败',
        tone: 'error',
      });
      setLoggingIn(false);
    }
  }

  const canSubmit = isValidPhone(phone.trim()) && code.trim().length >= 4 && !loggingIn;

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

          <YStack alignItems="center" gap={14} marginTop={26}>
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
                使用酷狗账号手机验证码登录
              </Text>
            </YStack>
          </YStack>

          <YStack gap={12} marginTop={34}>
            <XStack
              alignItems="center"
              gap={10}
              height={52}
              paddingHorizontal={16}
              borderRadius={16}
              backgroundColor={palette.card}
              borderWidth={1}
              borderColor={phoneFocused ? palette.accentBorder : palette.border}>
              <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                +86
              </Text>
              <View width={StyleSheet.hairlineWidth} height={18} backgroundColor={palette.border} />
              <TextInput
                value={phone}
                onChangeText={(value) => setPhone(value.replace(/[^\d]/g, '').slice(0, 11))}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                placeholder="手机号"
                placeholderTextColor={palette.textTertiary}
                keyboardType="number-pad"
                textContentType="telephoneNumber"
                editable={!loggingIn}
                style={[styles.input, { color: palette.text }]}
              />
            </XStack>

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

            <XStack
              height={52}
              borderRadius={26}
              overflow="hidden"
              alignItems="center"
              justifyContent="center"
              marginTop={8}
              opacity={canSubmit ? 1 : 0.55}
              transition="quickest"
              pressStyle={{ scale: 0.98, opacity: 0.85 }}
              onPress={() => {
                if (canSubmit) {
                  void handleLogin();
                }
              }}>
              <LinearGradient
                colors={[palette.gradientStart, palette.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {loggingIn ? (
                <Spinner size="small" color="#FFFFFF" />
              ) : (
                <Text color="#FFFFFF" fontSize={15.5} fontWeight="700" letterSpacing={1}>
                  登录
                </Text>
              )}
            </XStack>

            <XStack minHeight={20} justifyContent="center" alignItems="center">
              {notice ? (
                <Text
                  color={notice.tone === 'error' ? palette.danger : palette.textTertiary}
                  fontSize={12.5}
                  textAlign="center">
                  {notice.text}
                </Text>
              ) : null}
            </XStack>
          </YStack>

          <YStack flex={1} justifyContent="flex-end" alignItems="center" marginTop={30}>
            <Text color={palette.textTertiary} fontSize={11} textAlign="center" lineHeight={17}>
              登录凭证仅保存在本机安全存储，用于同步你的酷狗账号数据
            </Text>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 15.5,
    fontWeight: '500',
    paddingVertical: 0,
  },
});
