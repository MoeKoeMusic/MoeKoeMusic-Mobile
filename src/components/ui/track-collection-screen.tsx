import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { playCollection } from '@/features/player/play-collection';
import { useHasTrack, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type TrackPage = {
  tracks: PlayerTrack[];
  hasMore: boolean;
  total?: number;
};

type TrackCollectionScreenProps = {
  collectionKey: string;
  title: string;
  subtitle?: string;
  coverUrl: string | null;
  /** 没有封面图的集合（如云盘）用渐变图标块代替封面。 */
  coverIcon?: keyof typeof Ionicons.glyphMap;
  circleCover?: boolean;
  showRank?: boolean;
  emptyText: string;
  loadPage: (page: number) => Promise<TrackPage>;
};

type ScreenState = {
  tracks: PlayerTrack[];
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

/** 榜单/专辑等“封面 + 分页曲目列表”页面的共享骨架。 */
export function TrackCollectionScreen({
  collectionKey,
  title,
  subtitle,
  coverUrl,
  coverIcon,
  circleCover = false,
  showRank = false,
  emptyText,
  loadPage,
}: TrackCollectionScreenProps) {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();
  const requestIdRef = useRef(0);

  const [state, setState] = useState<ScreenState>({
    tracks: [],
    page: 0,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  useEffect(() => {
    void loadTracks(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionKey]);

  async function loadTracks(page: number) {
    const requestId = ++requestIdRef.current;
    setState((current) => ({
      ...current,
      loading: page === 1,
      loadingMore: page > 1,
      error: '',
    }));

    try {
      const result = await loadPage(page);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => {
          const seen = new Set(current.tracks.map((item) => item.hash));
          const merged =
            page === 1
              ? result.tracks
              : [...current.tracks, ...result.tracks.filter((item) => !seen.has(item.hash))];

          return {
            tracks: merged,
            page,
            total: result.total ?? current.total,
            hasMore: result.hasMore,
            loading: false,
            loadingMore: false,
            error: '',
          };
        });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          hasMore: page === 1 ? current.hasMore : false,
          error: error instanceof Error ? error.message : '内容加载失败',
        }));
      });
    }
  }

  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;
  const countText = state.total > 0 ? `共 ${state.total} 首` : state.tracks.length ? `${state.tracks.length} 首` : '';

  /** 从第 index 首开始播放整个集合：先播已加载的，后台补齐剩余分页到队列。 */
  function playFrom(index: number) {
    void playCollection({
      tracks: state.tracks,
      startIndex: index,
      loadedPage: state.page,
      hasMore: state.hasMore,
      loadPage,
    });
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <LinearGradient
        colors={[isDark ? 'rgba(255, 126, 182, 0.16)' : 'rgba(255, 92, 158, 0.14)', 'transparent']}
        style={styles.headerGlow}
      />

      <FlatList
        data={state.tracks}
        keyExtractor={(item, index) => `${item.hash}-${index}`}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (state.hasMore && !state.loading && !state.loadingMore) {
            void loadTracks(state.page + 1);
          }
        }}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: MaxContentWidth,
          paddingHorizontal: 12,
          paddingTop: insets.top + 8,
          paddingBottom: listBottomInset,
        }}
        ListHeaderComponent={
          <YStack gap={18} paddingHorizontal={4} paddingBottom={16}>
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

            <XStack gap={16} alignItems="center">
              {!coverUrl && coverIcon ? (
                <XStack
                  width={112}
                  height={112}
                  borderRadius={20}
                  overflow="hidden"
                  alignItems="center"
                  justifyContent="center">
                  <LinearGradient
                    colors={[palette.gradientStart, palette.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons name={coverIcon} size={46} color="#FFFFFF" />
                </XStack>
              ) : (
                <Artwork uri={coverUrl} size={112} radius={20} circle={circleCover} />
              )}
              <YStack flex={1} gap={7}>
                <Text color={palette.text} fontSize={20} fontWeight="800" numberOfLines={2}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text color={palette.textTertiary} fontSize={12.5} lineHeight={18} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
                {countText ? (
                  <Text color={palette.textTertiary} fontSize={12}>
                    {countText}
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {state.tracks.length ? (
              <XStack
                alignSelf="flex-start"
                alignItems="center"
                gap={7}
                height={44}
                paddingHorizontal={22}
                borderRadius={22}
                backgroundColor={palette.accent}
                transition="quickest"
                pressStyle={{ opacity: 0.85, scale: 0.97 }}
                onPress={() => playFrom(0)}>
                <Ionicons name="play" size={16} color={palette.onAccent} />
                <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                  播放全部
                </Text>
              </XStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          state.loading ? (
            <YStack alignItems="center" paddingVertical={70}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : state.error ? (
            <YStack alignItems="center" paddingVertical={60} gap={12} paddingHorizontal={28}>
              <Ionicons name="cloud-offline-outline" size={36} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13} textAlign="center">
                {state.error}
              </Text>
              <Text
                color={palette.accent}
                fontSize={14}
                fontWeight="600"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => void loadTracks(1)}
                suppressHighlighting>
                重试
              </Text>
            </YStack>
          ) : (
            <YStack alignItems="center" paddingVertical={60} gap={8}>
              <Ionicons name="musical-note" size={34} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13}>
                {emptyText}
              </Text>
            </YStack>
          )
        }
        ListFooterComponent={
          state.loadingMore ? (
            <XStack justifyContent="center" paddingVertical={16}>
              <Spinner color={palette.accent} />
            </XStack>
          ) : null
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            rank={showRank ? index + 1 : undefined}
            active={item.hash === activeHash}
            onPress={() => playFrom(index)}
            onMore={() => setActionTrack(item)}
          />
        )}
      />

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
      />

      <RNView
        pointerEvents="box-none"
        style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
        <RNView pointerEvents="box-none" style={styles.miniDockInner}>
          <MiniPlayer />
        </RNView>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
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
