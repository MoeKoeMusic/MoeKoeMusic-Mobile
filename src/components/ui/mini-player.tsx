import { Ionicons } from '@expo/vector-icons';
import { isGlassEffectAPIAvailable, GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useAnimationsEnabled } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { lightImpactHaptic } from '@/lib/haptics';

export const MINI_PLAYER_HEIGHT = 58;

/** 液态玻璃仅在支持的 iOS 上可用；其余平台回退到半透明底色。 */
const GLASS_AVAILABLE = isGlassEffectAPIAvailable();

let lastOpenPlayerAt = 0;

function ProgressHairline() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View
      position="absolute"
      left={16}
      right={16}
      bottom={0}
      height={2.5}
      borderRadius={999}
      backgroundColor={palette.cardAlt}
      overflow="hidden">
      <View
        width={`${ratio * 100}%`}
        height="100%"
        borderRadius={999}
        backgroundColor={palette.accent}
      />
    </View>
  );
}

export function MiniPlayer() {
  const palette = usePalette();
  const isDark = useIsDark();
  const animationsEnabled = useAnimationsEnabled();
  const router = useRouter();
  const { track, playing, loading, buffering } = usePlayer();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing && animationsEnabled) {
      rotation.set(
        withRepeat(withTiming(rotation.get() + 360, { duration: 16000, easing: Easing.linear }), -1, false)
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, animationsEnabled, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get() % 360}deg` }],
  }));

  if (!track) {
    return null;
  }

  const busy = loading || buffering;
  function openPlayer() {
    const now = Date.now();
    if (now - lastOpenPlayerAt < 800) {
      return;
    }

    lastOpenPlayerAt = now;
    router.push('/player');
  }

  const pill = (
    <XStack
      height={MINI_PLAYER_HEIGHT}
      alignItems="center"
      gap={10}
      paddingHorizontal={12}
      borderRadius={22}
      borderWidth={GLASS_AVAILABLE ? 0 : StyleSheet.hairlineWidth}
      borderColor={palette.border}
      // Android 无玻璃效果：底色几乎不透明，避免滚动内容透过卡片干扰文字
      backgroundColor={GLASS_AVAILABLE ? 'transparent' : isDark ? '#121216' : '#FAFAFC'}
      shadowColor={palette.dockShadow}
      shadowOffset={{ width: 0, height: isDark ? 3 : 8 }}
      shadowOpacity={isDark ? 0.18 : 0.1}
      shadowRadius={isDark ? 8 : 16}
      elevation={isDark ? 0 : 8}
      transition="quickest"
      pressStyle={{ scale: 0.98, opacity: 0.9 }}
      onPress={openPlayer}>
        <Animated.View style={[{ width: 40, height: 40 }, spinStyle]}>
          <Artwork uri={track.coverUrl} size={40} circle />
        </Animated.View>

        <YStack flex={1} gap={1}>
          <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
            {track.title}
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
            {track.artist || '未知歌手'}
          </Text>
        </YStack>

        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.accentSoft}
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.7 }}
          onPress={(event) => {
            event.stopPropagation();
            lightImpactHaptic();
            playerActions.toggle();
          }}>
          {busy ? (
            <Spinner size="small" color={palette.accent} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={18}
              color={palette.accent}
              style={playing ? undefined : { marginLeft: 2 }}
            />
          )}
        </XStack>

        <XStack
          width={34}
          height={38}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.next();
          }}>
          <Ionicons name="play-skip-forward" size={19} color={palette.textSecondary} />
        </XStack>

        <ProgressHairline />
      </XStack>
  );

  return (
    <Animated.View
      entering={animationsEnabled ? FadeInDown.duration(260).springify().damping(20) : undefined}
      exiting={animationsEnabled ? FadeOutDown.duration(180) : undefined}>
      {GLASS_AVAILABLE ? (
        <GlassView
          style={{ height: MINI_PLAYER_HEIGHT, borderRadius: 22, overflow: 'hidden' }}
          glassEffectStyle="regular"
          isInteractive>
          {pill}
        </GlassView>
      ) : (
        pill
      )}
    </Animated.View>
  );
}
