import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function ControlButton({
  label,
  primary = false,
}: {
  label: string;
  primary?: boolean;
}) {
  return (
    <Pressable>
      <View style={[styles.controlButton, primary && styles.controlButtonPrimary]}>
        <ThemedText type="smallBold" style={primary ? styles.controlButtonPrimaryText : undefined}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function PlayerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
          },
        ]}>
        <ThemedView type="backgroundElement" style={styles.hero}>
          <View style={[styles.blurOrbLarge, { backgroundColor: theme.backgroundSelected }]} />
          <View style={[styles.blurOrbSmall, { backgroundColor: theme.backgroundSelected }]} />

          <ThemedText type="smallBold" themeColor="textSecondary">
            正在播放
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            晴天
          </ThemedText>
          <ThemedText themeColor="textSecondary">周杰伦 · 单曲循环</ThemedText>

          <View style={styles.coverShell}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.coverImage}
              contentFit="cover"
            />
          </View>

          <View style={styles.progressBlock}>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.text }]} />
            </View>
            <View style={styles.timeRow}>
              <ThemedText type="small" themeColor="textSecondary">
                0:42
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                4:29
              </ThemedText>
            </View>
          </View>

          <View style={styles.controls}>
            <ControlButton label="上一首" />
            <ControlButton label="暂停" primary />
            <ControlButton label="下一首" />
          </View>

          <ThemedView style={[styles.lyricCard, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold">歌词</ThemedText>
            <ThemedText themeColor="textSecondary">歌词将在播放时同步显示。</ThemedText>
          </ThemedView>
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
  },
  hero: {
    overflow: 'hidden',
    borderRadius: 34,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    alignItems: 'center',
    gap: Spacing.three,
  },
  blurOrbLarge: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    top: -90,
    right: -60,
    opacity: 0.42,
  },
  blurOrbSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 999,
    left: -40,
    bottom: 80,
    opacity: 0.36,
  },
  title: {
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 40,
  },
  coverShell: {
    width: 274,
    height: 274,
    borderRadius: 999,
    padding: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 0,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  progressBlock: {
    width: '100%',
    gap: Spacing.one,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    width: '34%',
    height: '100%',
    borderRadius: 999,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  controlButton: {
    minWidth: 82,
    height: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  controlButtonPrimary: {
    minWidth: 96,
    backgroundColor: '#111827',
  },
  controlButtonPrimaryText: {
    color: '#FFFFFF',
  },
  lyricCard: {
    width: '100%',
    borderRadius: 26,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
});
