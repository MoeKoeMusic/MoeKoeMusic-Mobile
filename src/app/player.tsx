import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slider, Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { LyricsView } from '@/components/ui/lyrics-view';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { findActiveLyricIndex } from '@/features/player/lyrics';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import type { PlayMode } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

function SpinningDisc({ coverUrl, playing, size }: { coverUrl: string | null; playing: boolean; size: number }) {
  const isDark = useIsDark();
  const palette = usePalette();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 24000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  return (
    <Animated.View style={spinStyle}>
      <YStack
        width={size}
        height={size}
        borderRadius={size / 2}
        alignItems="center"
        justifyContent="center"
        backgroundColor={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.75)'}
        shadowColor="#000000"
        shadowOffset={{ width: 0, height: 18 }}
        shadowOpacity={isDark ? 0.5 : 0.18}
        shadowRadius={30}
        elevation={16}>
        <Artwork uri={coverUrl} size={size - 26} circle />
        <View
          position="absolute"
          width={15}
          height={15}
          borderRadius={8}
          backgroundColor={palette.card}
          borderWidth={3}
          borderColor={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(18, 19, 31, 0.16)'}
        />
      </YStack>
    </Animated.View>
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const player = usePlayer();
  const { positionMs, durationMs } = usePlayerProgress();

  const [pageIndex, setPageIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const pagerRef = useRef<ScrollView>(null);

  const { track, playing, loading, buffering, mode, error, lyrics, lyricsStatus } = player;

  const shownPosition = dragValue ?? positionMs;
  const activeLyricIndex = useMemo(
    () => findActiveLyricIndex(lyrics, positionMs + 240),
    [lyrics, positionMs]
  );

  const compact = height < 700;
  const discSize = Math.min(width - 104, compact ? 236 : 300);
  const busy = loading || buffering;

  function handlePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }

  if (!track) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={16}
        backgroundColor={palette.background}
        paddingTop={insets.top}>
        <Ionicons name="musical-notes-outline" size={44} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={14}>
          还没有正在播放的歌曲
        </Text>
        <XStack
          paddingHorizontal={24}
          height={42}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accentSoft}
          pressStyle={{ opacity: 0.7 }}
          onPress={() => router.back()}>
          <Text color={palette.accent} fontSize={14} fontWeight="600">
            返回
          </Text>
        </XStack>
      </YStack>
    );
  }

  return (
    <View flex={1} backgroundColor={palette.playerBottom}>
      <LinearGradient
        colors={[palette.playerTop, palette.playerBottom]}
        style={StyleSheet.absoluteFill}
      />

      <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={Math.max(insets.bottom, 14) + 6}>
        {/* 顶栏 */}
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={18}>
          <XStack
            width={40}
            height={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            transition="quickest"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={24} color={palette.textSecondary} />
          </XStack>
          <YStack alignItems="center" gap={2}>
            <Text color={palette.textTertiary} fontSize={11} letterSpacing={1.2}>
              正在播放
            </Text>
            <XStack gap={5} alignItems="center">
              {[0, 1].map((dot) => (
                <View
                  key={dot}
                  width={dot === pageIndex ? 14 : 5}
                  height={5}
                  borderRadius={999}
                  backgroundColor={dot === pageIndex ? palette.accent : palette.textTertiary}
                  opacity={dot === pageIndex ? 1 : 0.4}
                  transition="quick"
                />
              ))}
            </XStack>
          </YStack>
          <View width={40} height={40} />
        </XStack>

        {/* 封面 / 歌词 双页 */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePagerScroll}
          style={{ flex: 1 }}>
          <YStack width={width} alignItems="center" justifyContent="center" gap={compact ? 20 : 30}>
            <SpinningDisc coverUrl={track.coverUrl} playing={playing} size={discSize} />

            <YStack alignItems="center" gap={7} paddingHorizontal={40} maxWidth={560}>
              <Text
                color={palette.text}
                fontSize={compact ? 19 : 22}
                fontWeight="800"
                textAlign="center"
                numberOfLines={1}>
                {track.title}
              </Text>
              <Text color={palette.textSecondary} fontSize={14} numberOfLines={1}>
                {track.artist || '未知歌手'}
              </Text>
              {error ? (
                <XStack
                  alignItems="center"
                  gap={6}
                  marginTop={4}
                  paddingHorizontal={13}
                  paddingVertical={7}
                  borderRadius={999}
                  backgroundColor={palette.dangerSoft}>
                  <Ionicons name="alert-circle" size={13} color={palette.danger} />
                  <Text color={palette.danger} fontSize={12}>
                    {error}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </YStack>

          <YStack width={width} paddingTop={8}>
            <LyricsView
              lines={lyrics}
              activeIndex={activeLyricIndex}
              status={lyricsStatus}
              onSeekLine={(line) => playerActions.seekToMs(line.timeMs)}
            />
          </YStack>
        </ScrollView>

        {/* 进度与控制 */}
        <YStack paddingHorizontal={28} gap={compact ? 14 : 20} maxWidth={620} width="100%" alignSelf="center">
          <YStack gap={7}>
            <Slider
              size="$2"
              value={[Math.min(shownPosition, Math.max(durationMs, 1))]}
              max={Math.max(durationMs, 1)}
              step={250}
              disabled={!durationMs}
              onValueChange={(values) => {
                const next = values[0] ?? 0;
                dragValueRef.current = next;
                setDragValue(next);
              }}
              onSlideEnd={() => {
                if (dragValueRef.current !== null) {
                  playerActions.seekToMs(dragValueRef.current);
                }
                dragValueRef.current = null;
                setTimeout(() => setDragValue(null), 180);
              }}>
              <Slider.Track backgroundColor={palette.cardAlt} height={4} borderRadius={999}>
                <Slider.TrackActive backgroundColor={palette.accent} />
              </Slider.Track>
              <Slider.Thumb
                index={0}
                size={16}
                circular
                backgroundColor={palette.accent}
                borderWidth={2.5}
                borderColor="#FFFFFF"
                pressStyle={{
                  scale: 1.2,
                  backgroundColor: palette.accentPressed,
                  borderColor: '#FFFFFF',
                }}
                hoverStyle={{ backgroundColor: palette.accent, borderColor: '#FFFFFF' }}
                shadowColor="#000000"
                shadowOpacity={0.2}
                shadowRadius={5}
                shadowOffset={{ width: 0, height: 2 }}
              />
            </Slider>
            <XStack justifyContent="space-between">
              <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
                {formatClock(shownPosition)}
              </Text>
              <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
                {formatClock(durationMs)}
              </Text>
            </XStack>
          </YStack>

          <XStack alignItems="center" justifyContent="space-between">
            <XStack
              width={42}
              height={42}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => playerActions.cycleMode()}>
              <MaterialCommunityIcons name={MODE_ICON[mode]} size={22} color={palette.textSecondary} />
            </XStack>

            <XStack
              width={52}
              height={52}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.previous()}>
              <Ionicons name="play-skip-back" size={28} color={palette.text} />
            </XStack>

            <XStack
              width={74}
              height={74}
              borderRadius={37}
              overflow="hidden"
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ scale: 0.94, opacity: 0.9 }}
              onPress={() => playerActions.toggle()}>
              <LinearGradient
                colors={[palette.gradientStart, palette.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {busy ? (
                <Spinner size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={30}
                  color="#FFFFFF"
                  style={playing ? undefined : { marginLeft: 3 }}
                />
              )}
            </XStack>

            <XStack
              width={52}
              height={52}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.next()}>
              <Ionicons name="play-skip-forward" size={28} color={palette.text} />
            </XStack>

            <XStack
              width={42}
              height={42}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => setQueueOpen(true)}>
              <MaterialCommunityIcons name="playlist-music" size={24} color={palette.textSecondary} />
            </XStack>
          </XStack>
        </YStack>
      </YStack>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </View>
  );
}
