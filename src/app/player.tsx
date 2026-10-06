import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  InteractionManager,
  TouchableOpacity,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { Sheet, Slider, Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { LyricsView } from '@/components/ui/lyrics-view';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { OptionsSheet, LyricSettingsSheet } from '@/components/ui/option-sheet';
import { showToast, ToastHost } from '@/components/ui/toast';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { findArtistByName } from '@/features/artist/artist-api';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import type { PlayMode } from '@/features/player/types';
import {
  settingsActions,
  useLyricAlign,
  useLyricFontSize,
  useQuality,
  type LyricAlign,
  type LyricFontSize,
  type QualityId,
} from '@/features/settings/store';
import { useIsTablet } from '@/hooks/use-is-tablet';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { extractAmbientColor, mixHex, peekAmbientColor, withAlpha } from '@/lib/ambient-color';
import { formatClock, sizedImage } from '@/lib/format';
import { shareTrack } from '@/lib/share';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

const QUALITY_BADGE: Record<QualityId, string> = {
  '128': '标',
  '320': 'HQ',
  flac: 'SQ',
};

/** 整层背景的交叉淡入时长：慢一点才优雅，快了就和硬切没区别。 */
const AMBIENT_FADE_MS = 1100;

type AmbientLayer = {
  key: string;
  tint: string;
  coverUrl: string | null;
  id: number;
};

/**
 * 播放页整体背景（底色 + 模糊封面 + 主色遮罩）。取色完成或切歌时不硬切：
 * 新背景作为一整层盖在旧层上慢慢淡入，淡完移除旧层。
 * 每层都以不透明底色打底——两个不透明背景交叉淡入的中间帧才是干净的线性混合，
 * 半透明层叠半透明层会中途变深（旧版颜色"深-浅-深"抖动的根因）。
 */
function AmbientBackground({
  tint,
  coverUrl,
  isDark,
  baseColor,
}: {
  tint: string;
  coverUrl: string | null;
  isDark: boolean;
  baseColor: string;
}) {
  const [layers, setLayers] = useState<AmbientLayer[]>([
    { key: `${tint}-${coverUrl ?? ''}`, tint, coverUrl, id: 0 },
  ]);

  useEffect(() => {
    const key = `${tint}-${coverUrl ?? ''}`;
    setLayers((current) => {
      if (current[current.length - 1]!.key === key) {
        return current;
      }
      // 只保留紧邻的旧层：快速连续切歌也不会叠出一摞渐变
      return [...current.slice(-1), { key, tint, coverUrl, id: current[current.length - 1]!.id + 1 }];
    });
  }, [tint, coverUrl]);

  useEffect(() => {
    if (layers.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      setLayers((current) => current.slice(-1));
    }, AMBIENT_FADE_MS + 150);
    return () => clearTimeout(timer);
  }, [layers]);

  useEffect(() => {
    // 提前预加载模糊底图：淡入开始时图片已在缓存里，不会中途才解码掉帧
    const { coverUrl: url } = layers[layers.length - 1]!;
    const small = sizedImage(url, 240) ?? url;
    if (small) {
      void Image.prefetch(small, { cachePolicy: 'disk' });
    }
  }, [layers]);

  return (
    <>
      {layers.map((layer, layerIndex) => (
        <Animated.View
          key={layer.id}
          entering={
            layerIndex === 0
              ? undefined
              : FadeIn.duration(AMBIENT_FADE_MS).easing(Easing.inOut(Easing.cubic))
          }
          style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }]}>
          {layer.coverUrl ? (
            <Image
              // 模糊到 50 半径后细节全无：用 240px 小图渲染成本降 4 倍，观感一致
              source={{ uri: sizedImage(layer.coverUrl, 240) ?? layer.coverUrl }}
              style={StyleSheet.absoluteFill}
              blurRadius={50}
              contentFit="cover"
              transition={120}
              cachePolicy="disk"
            />
          ) : null}
          <LinearGradient
            colors={[
              isDark
                ? withAlpha(mixHex(layer.tint, '#000000', 0.45), 0.5)
                : withAlpha('#FFFFFF', 0.55),
              isDark
                ? withAlpha(mixHex(layer.tint, '#0E0F16', 0.78), 0.94)
                : withAlpha(mixHex(layer.tint, '#FFFFFF', 0.78), 0.92),
            ]}
            locations={[0, 0.55]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ))}
    </>
  );
}

const QUALITY_OPTIONS: { value: QualityId; label: string; hint: string }[] = [
  { value: '128', label: '标准音质', hint: '流畅，适合在线播放' },
  { value: '320', label: '高清音质', hint: '320Kbps' },
  { value: 'flac', label: '无损音质', hint: '需要酷狗会员，取不到时自动回退' },
];

const LYRIC_ALIGN_OPTIONS: { value: LyricAlign; label: string }[] = [
  { value: 'center', label: '居中对齐' },
  { value: 'left', label: '左对齐' },
];

const LYRIC_FONT_OPTIONS: { value: LyricFontSize; label: string }[] = [
  { value: 18, label: '小' },
  { value: 22, label: '标准' },
  { value: 26, label: '大' },
];

/** 封面大圆角卡片：暂停时轻微缩小，不降透明度（透明度会让背景色透进来显得发灰）。 */
function ArtworkCard({ coverUrl, playing, size }: { coverUrl: string | null; playing: boolean; size: number }) {
  const isDark = useIsDark();

  return (
    <View
      width={size}
      height={size}
      borderRadius={26}
      overflow="hidden"
      transform={[{ scale: playing ? 1 : 0.965 }]}
      transition="quick"
      shadowColor="#000000"
      shadowOffset={{ width: 0, height: 20 }}
      shadowOpacity={isDark ? 0.55 : 0.22}
      shadowRadius={36}
      style={{ elevation: 18 }}>
      <Artwork uri={coverUrl} size={size} radius={26} />
    </View>
  );
}

function PlaybackProgress() {
  const palette = usePalette();
  const isDark = useIsDark();
  const { positionMs, durationMs } = usePlayerProgress();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const shownPosition = dragValue ?? positionMs;
  // 进度条用跟随深浅色的中性色，不用主题色：封面主色背景什么颜色都可能有，
  // 主题色（如苹果红）撞上绿/蓝封面会很突兀
  const fill = palette.text;
  const track = isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.16)';

  return (
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
        <Slider.Track backgroundColor={track} height={4} borderRadius={999}>
          <Slider.TrackActive backgroundColor={fill} />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          size={16}
          circular
          backgroundColor={fill}
          borderWidth={2.5}
          borderColor="#FFFFFF"
          pressStyle={{
            scale: 1.2,
            backgroundColor: fill,
            borderColor: '#FFFFFF',
          }}
          hoverStyle={{ backgroundColor: fill, borderColor: '#FFFFFF' }}
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
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = useIsTablet();
  const player = usePlayer();

  const [pageIndex, setPageIndex] = useState(0);
  const [ambientByHash, setAmbientByHash] = useState<{ hash: string; color: string | null } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [lyricSettingsOpen, setLyricSettingsOpen] = useState(false);
  const quality = useQuality();
  const [artistBusy, setArtistBusy] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const pagerRef = useRef<ScrollView>(null);

  const { track, playing, loading, buffering, mode, error, lyrics, lyricsStatus } = player;
  const liked = useIsLiked(track?.hash);
  const trackHash = track?.hash ?? null;
  const coverUrl = track?.coverUrl ?? null;

  const compact = height < 700;
  /** 平板用左右分栏：封面与控制居左、歌词常驻右侧；手机仍是封面/歌词翻页。 */
  const splitLeftWidth = Math.round(Math.min(Math.max(width * 0.4, 300), 620));
  const artworkSize = isTablet
    ? Math.min(
        420,
        Math.max(180, Math.min(splitLeftWidth - 80, height - insets.top - insets.bottom - 400)),
      )
    : Math.min(width - 72, compact ? 250 : 320);
  const busy = loading || buffering;

  /** 播放页只有歌手名没有 id：先按名字搜出歌手再跳主页。 */
  function openArtistPage() {
    if (!track || artistBusy) {
      return;
    }

    setArtistBusy(true);
    findArtistByName(track.artist || '未知歌手')
      .then((artist) => {
        if (artist) {
          router.push({
            pathname: '/artist/[id]',
            params: { id: artist.id, name: artist.name, avatar: artist.avatarUrl ?? '' },
          });
        } else {
          showToast('没有找到这位歌手的主页');
        }
      })
      .catch(() => showToast('歌手主页打开失败，请稍后再试'))
      .finally(() => setArtistBusy(false));
  }

  useEffect(() => {
    // 换歌时按小尺寸封面重新取主色，失败保持中性配色。
    // 解 JPEG 是纯 JS 重活：等页面切换动画结束后再跑，否则点开卡片的
    // 那一下会和转场动画抢 JS 线程，背景/动画会明显掉帧。
    if (!trackHash) {
      return;
    }
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      const small = sizedImage(coverUrl, 240) ?? coverUrl;
      if (!small) {
        return;
      }
      extractAmbientColor(small).then((color) => {
        if (alive) {
          setAmbientByHash({ hash: trackHash, color });
        }
      });
    });
    return () => {
      alive = false;
      task.cancel();
    };
  }, [trackHash, coverUrl]);

  useEffect(() => {
    // 提前加载歌单库,让心形按钮反映真实喜欢状态
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setLyricsMounted(true));
    return () => task.cancel();
  }, []);

  useEffect(() => {
    // 分栏布局歌词常驻右侧，进页面就取词；翻页布局要等滑到歌词页
    if (isTablet || pageIndex === 1) {
      void playerActions.loadLyrics();
    }
  }, [isTablet, pageIndex, track?.hash]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    libraryActions
      .toggleLike(track)
      .then((result) => {
        showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      })
      .catch((cause) => {
        showToast(cause instanceof Error ? cause.message : '操作失败');
      })
      .finally(() => setLikeBusy(false));
  }

  // 背景由封面主色驱动。新歌取色完成前沿用上一首的主色（而不是先跳到中性灰），
  // 这样取色完成后只发生一次背景渐变，不会"旧色→灰→新色"抖两次。
  // 取色完成但确实无色（灰白封面/非 JPEG）才落到中性灰。
  // 初值同步查取色缓存：同一封面之前取过就直接用，进页不再"先灰一下再变色"。
  const neutralTint = isDark ? '#8A8FA3' : '#B9BECC';
  const [tint, setTint] = useState(() => {
    const cached = peekAmbientColor(sizedImage(coverUrl, 240) ?? coverUrl);
    return cached === undefined ? neutralTint : cached || neutralTint;
  });
  useEffect(() => {
    if (ambientByHash && ambientByHash.hash === trackHash) {
      setTint(ambientByHash.color ?? neutralTint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientByHash, trackHash]);

  function handlePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }

  const handleSeekLine = useCallback((line: { timeMs: number }) => {
    playerActions.seekToMs(line.timeMs);
  }, []);

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

  const collapseButton = (
    <XStack
      width={40}
      height={40}
      borderRadius={20}
      alignItems="center"
      justifyContent="center"
      transition="quickest"
      pressStyle={{ opacity: 0.6, scale: 0.92 }}
      onPress={() => router.dismiss()}>
      <Ionicons name="chevron-down" size={24} color={palette.textSecondary} />
    </XStack>
  );

  const lyricSettingsButton = (
    <XStack
      width={40}
      height={40}
      borderRadius={20}
      alignItems="center"
      justifyContent="center"
      transition="quickest"
      pressStyle={{ opacity: 0.6, scale: 0.92 }}
      onPress={() => setLyricSettingsOpen(true)}>
      <Ionicons name="options-outline" size={21} color={palette.textSecondary} />
    </XStack>
  );

  const pagerDots = (
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
  );

  const artworkBlock = <ArtworkCard coverUrl={track.coverUrl} playing={playing} size={artworkSize} />;

  const metaBlock = (
    <YStack alignItems="center" gap={7} paddingHorizontal={isTablet ? 8 : 40} maxWidth={560}>
      <Text
        color={palette.text}
        fontSize={compact ? 20 : 23}
        fontWeight="800"
        textAlign="center"
        numberOfLines={1}>
        {track.title}
      </Text>
      <Text
        color={palette.textSecondary}
        fontSize={15}
        numberOfLines={1}
        transition="quickest"
        pressStyle={{ opacity: 0.6 }}
        onPress={openArtistPage}>
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
  );

  const lyricsBlock = lyricsMounted ? (
    <LyricsView lines={lyrics} status={lyricsStatus} onSeekLine={handleSeekLine} />
  ) : null;

  const controlsBlock = (
    <YStack
      width="100%"
      maxWidth={isTablet ? splitLeftWidth - 40 : 620}
      paddingHorizontal={isTablet ? 0 : 28}
      gap={compact ? 14 : 20}
      alignSelf="center">
      <XStack alignItems="center" justifyContent="center" gap={46}>
        <XStack
          width={40}
          height={40}
          alignItems="center"
          justifyContent="center"
          opacity={likeBusy ? 0.5 : 1}
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={handleToggleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={24}
            color={liked ? palette.accent : palette.textSecondary}
          />
        </XStack>
        <XStack
          width={40}
          height={40}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={() => setActionsOpen(true)}>
          <MaterialCommunityIcons name="playlist-plus" size={24} color={palette.textSecondary} />
        </XStack>
        <XStack
          width={40}
          height={40}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={() => setQualityOpen(true)}>
          <View
            width={30}
            height={22}
            borderRadius={6}
            borderWidth={1.5}
            borderColor={quality === 'flac' ? palette.accent : palette.textSecondary}
            alignItems="center"
            justifyContent="center">
            <Text
              fontSize={9.5}
              fontWeight="800"
              letterSpacing={0.5}
              color={quality === 'flac' ? palette.accent : palette.textSecondary}>
              {QUALITY_BADGE[quality]}
            </Text>
          </View>
        </XStack>
        <XStack
          width={40}
          height={40}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={() => {
            if (track) {
              void shareTrack(track);
            }
          }}>
          <Ionicons name="share-social-outline" size={22} color={palette.textSecondary} />
        </XStack>
      </XStack>

      <PlaybackProgress />

      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={8}>
        <XStack
          width={44}
          height={44}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.9 }}
          onPress={() => playerActions.cycleMode()}>
          <MaterialCommunityIcons name={MODE_ICON[mode]} size={22} color={palette.textSecondary} />
        </XStack>

        <XStack
          width={56}
          height={56}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={() => playerActions.previous()}>
          <Ionicons name="play-skip-back" size={32} color={palette.text} />
        </XStack>

        <XStack
          width={72}
          height={72}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.75 }}
          onPress={() => playerActions.toggle()}>
          {busy ? (
            <Spinner size="large" color={palette.text} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={40}
              color={palette.text}
              style={playing ? undefined : { marginLeft: 4 }}
            />
          )}
        </XStack>

        <XStack
          width={56}
          height={56}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.88 }}
          onPress={() => playerActions.next()}>
          <Ionicons name="play-skip-forward" size={32} color={palette.text} />
        </XStack>

        <XStack
          width={44}
          height={44}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.55, scale: 0.9 }}
          onPress={() => setQueueOpen(true)}>
          <MaterialCommunityIcons name="playlist-music" size={22} color={palette.textSecondary} />
        </XStack>
      </XStack>
    </YStack>
  );

  return (
    <View flex={1} backgroundColor={palette.playerBottom}>
      {/* Apple Music 式背景：封面大图高斯模糊 + 按封面主色取的轻遮罩，
          整层作为不透明背景交叉淡入，顶部多透出封面色、底部收进主题色保证控件可读 */}
      <AmbientBackground
        tint={tint}
        coverUrl={track.coverUrl}
        isDark={isDark}
        baseColor={palette.playerBottom}
      />

      <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={Math.max(insets.bottom, 14) + 20}>
        {/* 顶栏：分栏时歌词常驻，设置与收起按钮一起靠右 */}
        <XStack
          zIndex={1}
          alignItems="center"
          gap={4}
          paddingHorizontal={18}
          justifyContent={isTablet ? 'flex-end' : 'space-between'}>
          {isTablet ? null : collapseButton}
          {isTablet ? null : pagerDots}
          {isTablet || pageIndex === 1 ? lyricSettingsButton : <View width={40} height={40} />}
          {isTablet ? collapseButton : null}
        </XStack>

        {isTablet ? (
          <XStack
            flex={1}
            gap={10}
            paddingLeft={insets.left + 14}
            paddingRight={insets.right + 14}>
            <YStack width={splitLeftWidth} alignItems="center" justifyContent="center" gap={24}>
              {artworkBlock}
              {metaBlock}
              {controlsBlock}
            </YStack>
            <YStack flex={1} paddingTop={4}>
              {lyricsBlock}
            </YStack>
          </XStack>
        ) : (
          <>
            {/* 封面 / 歌词 双页 */}
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handlePagerScroll}
              style={{ flex: 1 }}>
              <YStack width={width} alignItems="center" justifyContent="center" gap={compact ? 22 : 34}>
                {/* 封面页没有可点元素，点空白/封面直接翻到歌词页 */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    // Android 的程序化 scrollTo 不触发 onMomentumScrollEnd，页码要同步手动更新
                    setPageIndex(1);
                    pagerRef.current?.scrollTo({ x: width, animated: true });
                  }}>
                  <YStack flex={1} alignItems="center" justifyContent="center" gap={compact ? 22 : 34}>
                    {artworkBlock}
                    {metaBlock}
                  </YStack>
                </TouchableOpacity>
              </YStack>

              <YStack width={width} paddingTop={8} position="relative">
                {lyricsBlock}
              </YStack>
            </ScrollView>

            {controlsBlock}
          </>
        )}
      </YStack>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
      <OptionsSheet
        open={qualityOpen}
        onOpenChange={setQualityOpen}
        title="播放音质"
        options={QUALITY_OPTIONS}
        value={quality}
        onSelect={(next) => {
          void playerActions.applyQuality(next);
          showToast(next === 'flac' ? '已选无损音质，取不到时会自动回退' : '音质已切换');
        }}
      />
      <LyricSettingsSheet
        open={lyricSettingsOpen}
        onOpenChange={setLyricSettingsOpen}
      />
      <TrackActionsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        track={track}
        initialView="pick"
      />
      <ToastHost />
    </View>
  );
}
