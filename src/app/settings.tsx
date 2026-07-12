import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ACCENT_PRESETS, getPalette, type AccentPreset } from '@/constants/accents';
import { MaxContentWidth, type SchemeName } from '@/constants/theme';
import { isLoggedIn } from '@/features/account/user-api';
import { libraryActions } from '@/features/library/store';
import { settingsActions, useSettings, type ThemeMode } from '@/features/settings/store';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { clearApiSession } from '@/lib/kugou-api';

const THEME_MODE_OPTIONS = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const satisfies readonly { value: ThemeMode; label: string }[];

const REPO_URL = 'https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile';
const WEBSITE_URL = 'https://music.moekoe.cn';
const DISCLAIMER = [
  '0. 本程序是酷狗第三方客户端，并非酷狗官方，需要更完善的功能请下载官方客户端体验.',
  '1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途！',
  '2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产生的版权数据。',
  '3.由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。',
  '4. 禁止在违反当地法律法规的情况下使用本项目。对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。',
  '5. 音乐平台不易，请尊重版权，支持正版。',
  '6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。',
  '7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。',
];

function AccentSwatch({
  preset,
  scheme,
  active,
  onPress,
}: {
  preset: AccentPreset;
  scheme: SchemeName;
  active: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const presetPalette = getPalette(preset.id, scheme);

  return (
    <YStack
      alignItems="center"
      gap={6}
      transition="quickest"
      pressStyle={{ opacity: 0.7 }}
      onPress={onPress}>
      <View
        width={44}
        height={44}
        borderRadius={22}
        borderWidth={2}
        borderColor={active ? presetPalette.accent : 'transparent'}
        alignItems="center"
        justifyContent="center">
        <View
          width={34}
          height={34}
          borderRadius={17}
          backgroundColor={presetPalette.accent}
          alignItems="center"
          justifyContent="center">
          {active ? (
            <Ionicons name="checkmark" size={18} color={presetPalette.onAccent} />
          ) : null}
        </View>
      </View>
      <Text
        color={active ? palette.text : palette.textTertiary}
        fontSize={10.5}
        fontWeight={active ? '700' : '500'}>
        {preset.label}
      </Text>
    </YStack>
  );
}

function SettingsRow({
  label,
  value,
  danger,
  icon,
  onPress,
}: {
  label: string;
  value?: string;
  danger?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      height={48}
      paddingHorizontal={14}
      gap={10}
      transition="quickest"
      pressStyle={onPress ? { opacity: 0.65, backgroundColor: palette.cardAlt } : undefined}
      onPress={onPress}>
      <Text
        flex={1}
        color={danger ? palette.danger : palette.text}
        fontSize={14.5}
        fontWeight={danger ? '600' : '500'}
        textAlign={danger && !value && !icon ? 'center' : undefined}>
        {label}
      </Text>
      {value ? (
        <Text color={palette.textTertiary} fontSize={13}>
          {value}
        </Text>
      ) : null}
      {icon ? (
        <Ionicons name={icon} size={18} color={palette.textTertiary} />
      ) : null}
    </XStack>
  );
}

export default function SettingsScreen() {
  const palette = usePalette();
  const scheme = useEffectiveScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeMode, accentId } = useSettings();
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [aboutVisible, setAboutVisible] = useState(false);
  const version = Constants.expoConfig?.version ?? '';

  function openWeb(url: string, title: string) {
    router.push({ pathname: '/web', params: { url, title } });
  }

  function confirmLogout() {
    Alert.alert('退出登录', '将清除本机保存的登录信息', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearApiSession();
            libraryActions.reset();
            setLoggedIn(false);
          })();
        },
      },
    ]);
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <YStack
          alignSelf="center"
          width="100%"
          maxWidth={MaxContentWidth}
          paddingHorizontal={16}
          paddingTop={insets.top + 10}
          gap={18}>
          <XStack alignItems="center" gap={12}>
            <XStack
              width={38}
              height={38}
              borderRadius={19}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.card}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              transition="quickest"
              pressStyle={{ opacity: 0.7, scale: 0.96 }}
              onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </XStack>
            <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
              设置
            </Text>
          </XStack>

          <YStack gap={10}>
            <SectionHeader title="外观" />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              padding={14}
              gap={14}>
              <YStack gap={10}>
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  深色模式
                </Text>
                <SegmentedControl
                  options={THEME_MODE_OPTIONS}
                  value={themeMode}
                  onChange={settingsActions.setThemeMode}
                />
              </YStack>
              <View height={StyleSheet.hairlineWidth} backgroundColor={palette.border} />
              <YStack gap={12}>
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  主题色
                </Text>
                <XStack flexWrap="wrap" gap={14} justifyContent="flex-start">
                  {ACCENT_PRESETS.map((preset) => (
                    <AccentSwatch
                      key={preset.id}
                      preset={preset}
                      scheme={scheme}
                      active={preset.id === accentId}
                      onPress={() => settingsActions.setAccentId(preset.id)}
                    />
                  ))}
                </XStack>
              </YStack>
            </YStack>
          </YStack>

          <YStack gap={10}>
            <SectionHeader title="通用" />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={4}
              overflow="hidden">
              <SettingsRow label="版本" value={version ? `v${version}` : '—'} />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="GitHub"
                icon="logo-github"
                onPress={() => openWeb(REPO_URL, 'GitHub')}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="官网"
                icon="globe-outline"
                onPress={() => openWeb(WEBSITE_URL, '官网')}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="关于"
                icon="information-circle-outline"
                onPress={() => setAboutVisible(true)}
              />
              {loggedIn ? (
                <>
                  <View
                    height={StyleSheet.hairlineWidth}
                    backgroundColor={palette.border}
                    marginHorizontal={14}
                  />
                  <SettingsRow label="退出登录" danger onPress={confirmLogout} />
                </>
              ) : null}
            </YStack>
          </YStack>

          {version ? (
            <Text color={palette.textTertiary} fontSize={11} textAlign="center" paddingTop={6}>
              MoeKoe Music v{version}
            </Text>
          ) : null}
        </YStack>
      </ScrollView>

      <Modal
        visible={aboutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAboutVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={(event) => event.stopPropagation()}>
            <YStack
              maxHeight="82%"
              backgroundColor={palette.card}
              borderRadius={22}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              overflow="hidden">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}>
                <Text color={palette.text} fontSize={21} fontWeight="800" textAlign="center">
                  免责声明
                </Text>
                <YStack gap={12}>
                  {DISCLAIMER.map((content) => (
                    <Text key={content} color={palette.textSecondary} fontSize={13} lineHeight={20}>
                      {content}
                    </Text>
                  ))}
                </YStack>
                <XStack
                  height={44}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accent}
                  transition="quickest"
                  pressStyle={{ opacity: 0.78 }}
                  onPress={() => setAboutVisible(false)}>
                  <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                    关闭
                  </Text>
                </XStack>
                <Text color={palette.textTertiary} fontSize={11} textAlign="center">
                  © MoeKoe Music{version ? ` V${version} - ${Platform.OS}` : ''}
                </Text>
              </ScrollView>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
  },
  modalContent: {
    gap: 18,
    padding: 20,
  },
});
