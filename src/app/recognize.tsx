import { Ionicons } from '@expo/vector-icons';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View as RNView,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { MiniPlayer } from '@/components/ui/mini-player';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { playerActions, useHasTrack } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import {
  buildRecognizePcm,
  recognizeAudio,
  RECOGNIZE_MAX_SECONDS,
  RECOGNIZE_SAMPLE_RATE,
  type PcmChunk,
  type RecognizeMatch,
} from '@/features/recognize/recognize-api';
import { usePalette } from '@/hooks/use-palette';

type Status = 'idle' | 'recording' | 'recognizing' | 'success' | 'failed';

/** 与 player/store 的全局播放配置保持一致，录音结束后恢复。 */
const PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
} as const;

const RECORDING_AUDIO_MODE = {
  ...PLAYBACK_AUDIO_MODE,
  allowsRecording: true,
} as const;

const CARD_GAP = 14;

export default function RecognizeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { width: windowWidth } = useWindowDimensions();

  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [matches, setMatches] = useState<RecognizeMatch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  const chunksRef = useRef<PcmChunk[]>([]);
  const capturingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  // 每次开始识别自增；reset 也自增使晚到的旧结果失效
  const recognizeSeqRef = useRef(0);

  const { stream } = useAudioStream({
    sampleRate: RECOGNIZE_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      if (capturingRef.current) {
        chunksRef.current.push({
          data: buffer.data,
          sampleRate: buffer.sampleRate,
          channels: buffer.channels,
        });
      }
    },
  });
  const streamRef = useRef(stream);
  streamRef.current = stream;

  const pulse = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  const recording = status === 'recording';
  const busy = status === 'recording' || status === 'recognizing';

  useEffect(() => {
    if (!recording) {
      pulse.setValue(0);
      ripple.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const rippleLoop = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulseLoop.start();
    rippleLoop.start();
    return () => {
      pulseLoop.stop();
      rippleLoop.stop();
    };
  }, [recording, pulse, ripple]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      capturingRef.current = false;
      try {
        streamRef.current.stop();
      } catch {
        // 未开始录音时 stop 可能抛错，忽略
      }
      void setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => undefined);
    };
  }, []);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    if (busy) {
      return;
    }

    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        permission = await requestRecordingPermissionsAsync();
      }
      if (!permission.granted) {
        setStatus('failed');
        setErrorMsg('需要麦克风权限才能识曲，请在系统设置中允许');
        return;
      }
    } catch {
      setStatus('failed');
      setErrorMsg('无法获取麦克风权限');
      return;
    }

    // 录音时暂停自家播放，避免识别到正在播的歌
    playerActions.pause();

    chunksRef.current = [];
    setMatches([]);
    setSelectedIndex(0);
    setErrorMsg('');
    setSeconds(0);

    try {
      await setAudioModeAsync(RECORDING_AUDIO_MODE);
      await stream.start();
    } catch (error) {
      void setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => undefined);
      setStatus('failed');
      setErrorMsg(error instanceof Error ? error.message : '无法启动录音');
      return;
    }

    capturingRef.current = true;
    setStatus('recording');
    clearTimer();
    secondsRef.current = 0;
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= RECOGNIZE_MAX_SECONDS) {
        stopRecording();
      }
    }, 1000);
  }

  function stopRecording() {
    if (!capturingRef.current) {
      return;
    }

    clearTimer();
    capturingRef.current = false;
    try {
      stream.stop();
    } catch {
      // 忽略重复 stop
    }
    void setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => undefined);
    void runRecognize();
  }

  async function runRecognize() {
    const pcm = buildRecognizePcm(chunksRef.current);
    const seq = ++recognizeSeqRef.current;

    // 少于 1 秒的样本基本识别不出来
    if (pcm.byteLength < RECOGNIZE_SAMPLE_RATE * 2) {
      setStatus('failed');
      setErrorMsg('没有录到足够的声音，请靠近音源重试');
      return;
    }

    setStatus('recognizing');
    try {
      const result = await recognizeAudio(pcm);
      if (seq !== recognizeSeqRef.current) {
        return;
      }

      if (result.length) {
        setMatches(result);
        setSelectedIndex(0);
        setStatus('success');
      } else {
        setStatus('failed');
        setErrorMsg('未识别到歌曲，请靠近音源重试');
      }
    } catch {
      if (seq !== recognizeSeqRef.current) {
        return;
      }
      setStatus('failed');
      setErrorMsg('识别过程出错，请检查网络后重试');
    }
  }

  function toggleRecording() {
    if (status === 'recording') {
      stopRecording();
    } else {
      void startRecording();
    }
  }

  function reset() {
    clearTimer();
    capturingRef.current = false;
    secondsRef.current = 0;
    recognizeSeqRef.current += 1;
    setStatus('idle');
    setMatches([]);
    setSelectedIndex(0);
    setErrorMsg('');
    setSeconds(0);
  }

  function searchMatch(track: PlayerTrack) {
    router.push({ pathname: '/search', params: { q: `${track.title} ${track.artist}` } });
  }

  const statusText =
    status === 'recording'
      ? `正在聆听 ${seconds}s`
      : status === 'recognizing'
        ? '识别中，请稍候…'
        : status === 'failed'
          ? errorMsg || '未识别到歌曲'
          : '靠近音源，点击按钮开始识别';

  const contentWidth = Math.min(windowWidth, MaxContentWidth);
  const cardWidth = Math.min(contentWidth - 104, 300);
  const sidePadding = Math.max(0, (windowWidth - cardWidth) / 2);

  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  function handleCarouselScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (cardWidth + CARD_GAP));
    setSelectedIndex(Math.max(0, Math.min(matches.length - 1, index)));
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <LinearGradient
        colors={[palette.accentSoft, 'transparent']}
        style={styles.headerGlow}
      />

      <YStack flex={1} paddingTop={insets.top + 8}>
        <XStack
          alignSelf="center"
          width="100%"
          maxWidth={MaxContentWidth}
          alignItems="center"
          gap={12}
          paddingHorizontal={16}>
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
            pressStyle={{ opacity: 0.6, scale: 0.94 }}
            onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.text} />
          </XStack>
          <Text color={palette.text} fontSize={19} fontWeight="800">
            听歌识曲
          </Text>
        </XStack>

        {status === 'success' && matches.length ? (
          <YStack flex={1} justifyContent="center" gap={22} paddingBottom={insets.bottom + 40}>
            <YStack alignItems="center" gap={4}>
              <Text color={palette.text} fontSize={16} fontWeight="700">
                为你找到 {matches.length} 个结果
              </Text>
              <Text color={palette.textTertiary} fontSize={12.5}>
                左右滑动查看其他匹配
              </Text>
            </YStack>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + CARD_GAP}
              decelerationRate="fast"
              onMomentumScrollEnd={handleCarouselScroll}
              contentContainerStyle={{
                paddingHorizontal: sidePadding,
                gap: CARD_GAP,
                alignItems: 'center',
              }}
              style={{ flexGrow: 0 }}>
              {matches.map((match, index) => (
                <YStack
                  key={`${match.track.hash}-${index}`}
                  width={cardWidth}
                  borderRadius={26}
                  overflow="hidden"
                  backgroundColor={palette.card}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={palette.border}>
                  <RNView>
                    <Artwork uri={match.track.coverUrl} radius={0} />
                    {match.confidence > 0 ? (
                      <XStack
                        position="absolute"
                        top={10}
                        right={10}
                        paddingHorizontal={9}
                        paddingVertical={4}
                        borderRadius={999}
                        backgroundColor="rgba(0, 0, 0, 0.45)">
                        <Text color="#FFFFFF" fontSize={11} fontWeight="700">
                          匹配度 {Math.round(match.confidence * 100)}%
                        </Text>
                      </XStack>
                    ) : null}
                  </RNView>

                  <YStack paddingHorizontal={16} paddingVertical={14} gap={3} alignItems="center">
                    <Text
                      color={palette.text}
                      fontSize={16.5}
                      fontWeight="800"
                      numberOfLines={1}
                      textAlign="center">
                      {match.track.title}
                    </Text>
                    <Text color={palette.textSecondary} fontSize={13} numberOfLines={1}>
                      {match.track.artist}
                    </Text>
                    {match.track.album ? (
                      <Text color={palette.textTertiary} fontSize={12} numberOfLines={1}>
                        {match.track.album}
                      </Text>
                    ) : null}

                    <XStack marginTop={12} alignItems="center" gap={10} alignSelf="stretch">
                      <XStack
                        flex={1}
                        height={40}
                        borderRadius={20}
                        alignItems="center"
                        justifyContent="center"
                        gap={6}
                        backgroundColor={palette.accent}
                        transition="quickest"
                        pressStyle={{ opacity: 0.85, scale: 0.97 }}
                        onPress={() => void playerActions.playTrackNow(match.track)}>
                        <Ionicons name="play" size={14} color={palette.onAccent} />
                        <Text color={palette.onAccent} fontSize={13.5} fontWeight="700">
                          播放
                        </Text>
                      </XStack>
                      <XStack
                        width={40}
                        height={40}
                        borderRadius={20}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={palette.cardAlt}
                        transition="quickest"
                        pressStyle={{ opacity: 0.7, scale: 0.94 }}
                        onPress={() => setActionTrack(match.track)}>
                        <Ionicons name="add" size={19} color={palette.text} />
                      </XStack>
                      <XStack
                        width={40}
                        height={40}
                        borderRadius={20}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={palette.cardAlt}
                        transition="quickest"
                        pressStyle={{ opacity: 0.7, scale: 0.94 }}
                        onPress={() => searchMatch(match.track)}>
                        <Ionicons name="search" size={16} color={palette.text} />
                      </XStack>
                    </XStack>
                  </YStack>
                </YStack>
              ))}
            </ScrollView>

            {matches.length > 1 ? (
              <XStack justifyContent="center" gap={7}>
                {matches.map((match, index) => (
                  <View
                    key={`${match.track.hash}-dot-${index}`}
                    width={index === selectedIndex ? 16 : 6}
                    height={6}
                    borderRadius={3}
                    transition="quickest"
                    backgroundColor={index === selectedIndex ? palette.accent : palette.cardAlt}
                  />
                ))}
              </XStack>
            ) : null}

            <XStack justifyContent="center" alignItems="center" gap={4}>
              <Text color={palette.textTertiary} fontSize={13}>
                没有找到满意的结果？
              </Text>
              <Text
                color={palette.accent}
                fontSize={13.5}
                fontWeight="700"
                pressStyle={{ opacity: 0.6 }}
                onPress={reset}
                suppressHighlighting>
                重新识别
              </Text>
            </XStack>
          </YStack>
        ) : (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            gap={34}
            paddingHorizontal={32}
            paddingBottom={insets.bottom + 60}>
            <YStack alignItems="center" gap={8}>
              <Text
                color={status === 'failed' ? palette.danger : palette.textSecondary}
                fontSize={14.5}
                textAlign="center"
                lineHeight={21}>
                {statusText}
              </Text>
            </YStack>

            <RNView style={styles.buttonStage}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.ripple,
                  {
                    backgroundColor: palette.accent,
                    opacity: rippleOpacity,
                    transform: [{ scale: rippleScale }],
                  },
                ]}
              />
              <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                <XStack
                  width={136}
                  height={136}
                  borderRadius={68}
                  overflow="hidden"
                  alignItems="center"
                  justifyContent="center"
                  opacity={status === 'recognizing' ? 0.65 : 1}
                  transition="quickest"
                  pressStyle={{ scale: 0.96 }}
                  onPress={status === 'recognizing' ? undefined : toggleRecording}>
                  <LinearGradient
                    colors={
                      recording
                        ? ['#FF7A59', '#F0424B']
                        : [palette.gradientStart, palette.gradientEnd]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {status === 'recognizing' ? (
                    <Spinner size="large" color="#FFFFFF" />
                  ) : (
                    <Ionicons name={recording ? 'stop' : 'mic'} size={46} color="#FFFFFF" />
                  )}
                </XStack>
              </Animated.View>
            </RNView>

            <YStack alignItems="center" gap={10}>
              {status === 'failed' ? (
                <Text
                  color={palette.accent}
                  fontSize={14}
                  fontWeight="700"
                  pressStyle={{ opacity: 0.6 }}
                  onPress={() => void startRecording()}
                  suppressHighlighting>
                  重新识别
                </Text>
              ) : (
                <Text color={palette.textTertiary} fontSize={12.5} textAlign="center" lineHeight={19}>
                  {recording
                    ? `最长录制 ${RECOGNIZE_MAX_SECONDS} 秒，可点击提前结束`
                    : '识别外放中的歌曲，人声哼唱可能无法识别'}
                </Text>
              )}
            </YStack>
          </YStack>
        )}
      </YStack>

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
      />

      {hasTrack ? (
        <RNView
          pointerEvents="box-none"
          style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
          <RNView pointerEvents="box-none" style={styles.miniDockInner}>
            <MiniPlayer />
          </RNView>
        </RNView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  buttonStage: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 136,
    height: 136,
    borderRadius: 68,
  },
  miniDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  miniDockInner: {
    width: '100%',
    maxWidth: 680,
  },
});
