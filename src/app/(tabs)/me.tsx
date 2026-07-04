import { startTransition, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  bootstrapMobileApi,
  clearApiSession,
  getApiSession,
  mobileApi,
} from '@/lib/kugou-api';

type UnknownRecord = Record<string, unknown>;

type PageState = {
  session: Record<string, string>;
  message: string;
  loading: boolean;
  sendingCode: boolean;
  loggingIn: boolean;
  countdown: number;
};

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

function readApiMessage(body: unknown) {
  const data = toRecord(body);
  return pickText(data.error_msg, data.errmsg, data.msg, data.message, data.error, data.info);
}

function isApiSuccess(body: unknown) {
  const data = toRecord(body);
  return Boolean(
    data.status === 1 || data.code === 200 || data.errcode === 0 || data.error_code === 0
  );
}

function isValidPhone(value: string) {
  return /^1\d{10}$/.test(value);
}

function maskPhone(value: string) {
  if (!isValidPhone(value)) {
    return value;
  }

  return `${value.slice(0, 3)}****${value.slice(7)}`;
}

function Button({
  label,
  onPress,
  disabled,
  secondary = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <View
        style={[
          styles.button,
          secondary ? styles.buttonSecondary : styles.buttonPrimary,
          disabled && styles.buttonDisabled,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={secondary ? '#111827' : '#FFFFFF'} />
        ) : (
          <ThemedText
            type="smallBold"
            style={secondary ? styles.buttonSecondaryText : styles.buttonPrimaryText}>
            {label}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

export default function MeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<PageState>({
    session: {},
    message: '',
    loading: true,
    sendingCode: false,
    loggingIn: false,
    countdown: 0,
  });

  const isLoggedIn = Boolean(state.session.userid && state.session.token);
  const maskedPhone = useMemo(() => maskPhone(phone), [phone]);

  useEffect(() => {
    void hydrateSession();
  }, []);

  useEffect(() => {
    if (state.countdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        countdown: Math.max(0, current.countdown - 1),
      }));
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.countdown]);

  async function hydrateSession() {
    try {
      await bootstrapMobileApi();

      startTransition(() => {
        setState((current) => ({
          ...current,
          loading: false,
          session: getApiSession(),
          message: '',
        }));
      });
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          loading: false,
          session: getApiSession(),
          message: error instanceof Error ? error.message : String(error),
        }));
      });
    }
  }

  async function handleSendCode() {
    const mobile = phone.trim();
    if (!isValidPhone(mobile)) {
      setState((current) => ({
        ...current,
        message: '请输入正确的 11 位手机号。',
      }));
      return;
    }

    setState((current) => ({
      ...current,
      sendingCode: true,
      message: '',
    }));

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.captcha_sent({ mobile });

      if (!isApiSuccess(response.body)) {
        throw new Error(readApiMessage(response.body) || '验证码发送失败');
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          sendingCode: false,
          countdown: 60,
          message: `验证码已发送到 ${maskPhone(mobile)}。`,
        }));
      });
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          sendingCode: false,
          message: error instanceof Error ? error.message : String(error),
        }));
      });
    }
  }

  async function handleLogin() {
    const mobile = phone.trim();
    const verifyCode = code.trim();

    if (!isValidPhone(mobile)) {
      setState((current) => ({
        ...current,
        message: '请输入正确的 11 位手机号。',
      }));
      return;
    }

    if (verifyCode.length < 4) {
      setState((current) => ({
        ...current,
        message: '请输入收到的验证码。',
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loggingIn: true,
      message: '',
    }));

    try {
      await bootstrapMobileApi();
      const response = await mobileApi.login_cellphone({ mobile, code: verifyCode });

      if (!isApiSuccess(response.body)) {
        throw new Error(readApiMessage(response.body) || '登录失败');
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          loggingIn: false,
          session: getApiSession(),
          message: `已登录 ${maskPhone(mobile)}。`,
        }));
        setCode('');
      });
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          loggingIn: false,
          session: getApiSession(),
          message: error instanceof Error ? error.message : String(error),
        }));
      });
    }
  }

  async function handleClearSession() {
    setState((current) => ({
      ...current,
      loading: true,
      message: '',
    }));

    await clearApiSession();
    setPhone('');
    setCode('');

    await hydrateSession();
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <View style={styles.header}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            我的
          </ThemedText>
          <ThemedText type="title" style={styles.headerTitle}>
            账号中心
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            使用手机号验证码登录 MoeKoe，登录状态会和应用内 API 会话一起保存在本机。
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.accountCard}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarCore, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="subtitle" style={styles.avatarText}>
                {isLoggedIn ? 'M' : '我'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.accountMeta}>
            <ThemedText type="subtitle" style={styles.accountTitle}>
              {isLoggedIn ? '当前账号已登录' : '登录后可同步个人状态'}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {isLoggedIn
                ? `用户 ID ${state.session.userid} · ${
                    state.session.vip_type === '0' ? '普通账号' : 'VIP 账号'
                  }`
                : '登录成功后，推荐、收藏和个人数据请求会自动带上账号会话。'}
            </ThemedText>
          </View>

          <View style={styles.accountStats}>
            <View style={[styles.statChip, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold">{state.session.dfid ? '已注册' : '未注册'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                设备会话
              </ThemedText>
            </View>
            <View style={[styles.statChip, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold">{state.session.token ? '已登录' : '未登录'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                账号状态
              </ThemedText>
            </View>
          </View>

          {state.loading ? (
            <View style={styles.accountLoading}>
              <ActivityIndicator />
              <ThemedText themeColor="textSecondary">正在恢复本地会话…</ThemedText>
            </View>
          ) : null}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.formCard}>
          <View style={styles.formHeader}>
            <ThemedText type="subtitle" style={styles.formTitle}>
              手机号验证码登录
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              验证码发送和登录都直接调用应用内 API，不需要额外配置接口地址。
            </ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold">手机号</ThemedText>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/[^\d]/g, '').slice(0, 11))}
              placeholder="请输入 11 位手机号"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              editable={!state.loggingIn}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                },
              ]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold">验证码</ThemedText>
            <View style={styles.codeRow}>
              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.replace(/[^\d]/g, '').slice(0, 8))}
                placeholder="请输入短信验证码"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                editable={!state.loggingIn}
                style={[
                  styles.input,
                  styles.codeInput,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                  },
                ]}
              />
              <Button
                label={
                  state.countdown > 0
                    ? `${state.countdown}s 后重发`
                    : state.sendingCode
                      ? '发送中'
                      : '获取验证码'
                }
                onPress={() => void handleSendCode()}
                disabled={state.countdown > 0 || state.sendingCode || state.loggingIn}
                secondary
                loading={state.sendingCode}
              />
            </View>
          </View>

          <View style={styles.noticeBlock}>
            <ThemedText type="smallBold">
              {maskedPhone && isValidPhone(phone)
                ? `验证码将发送到 ${maskedPhone}`
                : '验证码由酷狗登录接口直接下发'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {state.message || '登录成功后，MoeKoe 会自动更新当前账号会话。'}
            </ThemedText>
          </View>

          <View style={styles.formActions}>
            <Button
              label={isLoggedIn ? '切换到这个手机号' : '立即登录'}
              onPress={() => void handleLogin()}
              disabled={state.loggingIn || state.loading}
              loading={state.loggingIn}
            />
            <Button
              label="清空会话"
              onPress={() => void handleClearSession()}
              disabled={state.loading || state.loggingIn || state.sendingCode}
              secondary
            />
          </View>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.footnoteCard}>
          <ThemedText type="smallBold">登录说明</ThemedText>
          <ThemedText themeColor="textSecondary">
            当前版本支持手机号验证码登录与本机会话管理，登录态会自动写入安全存储。
          </ThemedText>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  headerTitle: {
    fontSize: 38,
    lineHeight: 42,
  },
  accountCard: {
    borderRadius: 32,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  avatarWrap: {
    alignItems: 'flex-start',
  },
  avatarCore: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    lineHeight: 30,
  },
  accountMeta: {
    gap: Spacing.one,
  },
  accountTitle: {
    fontSize: 28,
    lineHeight: 32,
  },
  accountStats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statChip: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  accountLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  formCard: {
    borderRadius: 32,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  formHeader: {
    gap: Spacing.one,
  },
  formTitle: {
    fontSize: 28,
    lineHeight: 32,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontWeight: '500',
  },
  codeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
  },
  noticeBlock: {
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  formActions: {
    gap: Spacing.two,
  },
  button: {
    minHeight: 52,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#111827',
  },
  buttonSecondary: {
    backgroundColor: '#E6EAEE',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
  },
  buttonSecondaryText: {
    color: '#111827',
  },
  buttonDisabled: {
    opacity: 0.52,
  },
  footnoteCard: {
    borderRadius: 28,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.82,
  },
});
