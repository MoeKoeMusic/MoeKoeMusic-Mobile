import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { PlaylistCard } from '@/components/ui/playlist-card';
import { RankCard } from '@/components/ui/rank-card';
import { SectionHeader } from '@/components/ui/section-header';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth, WideBreakpoint } from '@/constants/theme';
import { loadHomeData, type HomeData } from '@/features/home/load-home-data';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { formatApiError } from '@/lib/api-parse';

type ScreenState = {
  homeData: HomeData | null;
  initialLoading: boolean;
  refreshing: boolean;
  errorMessage: string;
};

export default function HomeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const { width } = useWindowDimensions();
  const { track } = usePlayer();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    homeData: null,
    initialLoading: true,
    refreshing: false,
    errorMessage: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  const contentWidth = Math.min(width, MaxContentWidth) - 32;
  const playlistColumns = contentWidth >= WideBreakpoint ? 3 : 2;
  const playlistCardWidth = Math.floor(
    (contentWidth - 14 * (playlistColumns - 1)) / playlistColumns
  );
  const bannerWidth = Math.min(contentWidth, 560);
  const bannerHeight = Math.round(bannerWidth * 0.44);

  async function refreshHome(mode: 'initial' | 'refresh' = 'initial') {
    const requestId = ++requestIdRef.current;

    startTransition(() => {
      setState((current) => ({
        ...current,
        initialLoading: !current.homeData,
        refreshing: Boolean(current.homeData),
        errorMessage: '',
      }));
    });

    try {
      const homeData = await loadHomeData();
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState({
          homeData,
          initialLoading: false,
          refreshing: false,
          errorMessage: '',
        });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = formatApiError(error);
      startTransition(() => {
        setState((current) => ({
          homeData: current.homeData,
          initialLoading: false,
          refreshing: false,
          errorMessage: message,
        }));
      });
    }
  }

  useEffect(() => {
    void refreshHome('initial');
  }, []);

  if (!state.homeData && state.initialLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={14} backgroundColor={palette.background}>
        <Spinner size="large" color={palette.accent} />
        <Text color={palette.textTertiary} fontSize={13.5}>
          正在为你准备今日推荐
        </Text>
      </YStack>
    );
  }

  if (!state.homeData) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={18}
        paddingHorizontal={32}
        backgroundColor={palette.background}>
        <Ionicons name="cloud-offline-outline" size={44} color={palette.textTertiary} />
        <YStack alignItems="center" gap={6}>
          <Text color={palette.text} fontSize={17} fontWeight="700">
            内容加载失败
          </Text>
          <Text color={palette.textTertiary} fontSize={13} textAlign="center">
            {state.errorMessage || '网络似乎不太顺畅，请稍后重试'}
          </Text>
        </YStack>
        <XStack
          paddingHorizontal={26}
          height={44}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accent}
          transition="quickest"
          pressStyle={{ opacity: 0.8, scale: 0.97 }}
          onPress={() => void refreshHome('initial')}>
          <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
            重新加载
          </Text>
        </XStack>
      </YStack>
    );
  }

  const { homeData } = state;
  const activeHash = track?.hash;

  return (
    <View flex={1} backgroundColor={palette.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void refreshHome('refresh')}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressViewOffset={insets.top}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 14,
            paddingBottom: dockInset,
          },
        ]}>
        <XStack
          alignItems="center"
          gap={9}
          height={46}
          paddingHorizontal={16}
          borderRadius={23}
          backgroundColor={palette.card}
          borderWidth={StyleSheet.hairlineWidth}
          borderColor={palette.border}
          transition="quickest"
          pressStyle={{ opacity: 0.7, scale: 0.99 }}
          onPress={() => router.push('/search')}>
          <Ionicons name="search" size={17} color={palette.textTertiary} />
          <Text color={palette.textTertiary} fontSize={14}>
            搜索歌曲、歌手、歌单
          </Text>
        </XStack>

        {state.errorMessage ? (
          <XStack
            alignItems="center"
            gap={8}
            paddingHorizontal={14}
            paddingVertical={10}
            borderRadius={14}
            backgroundColor={palette.dangerSoft}>
            <Ionicons name="alert-circle" size={15} color={palette.danger} />
            <Text flex={1} color={palette.danger} fontSize={12.5}>
              部分内容刷新失败，正在展示上次内容
            </Text>
          </XStack>
        ) : null}

        {homeData.banners.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={bannerWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={styles.bannerList}>
            {homeData.banners.map((banner) => (
              <View
                key={banner.id}
                width={bannerWidth}
                height={bannerHeight}
                borderRadius={22}
                overflow="hidden"
                backgroundColor={palette.cardAlt}>
                <Image
                  source={{ uri: banner.imageUrl ?? undefined }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={220}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(10, 10, 16, 0.62)']}
                  style={styles.bannerOverlay}>
                  <Text color="#FFFFFF" fontSize={15} fontWeight="700" numberOfLines={1}>
                    {banner.title}
                  </Text>
                </LinearGradient>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {homeData.dailySongs.length ? (
          <YStack gap={10}>
            <SectionHeader
              title="每日推荐"
              subtitle="根据你的口味每天更新"
              actionLabel="播放全部"
              onAction={() => void playerActions.playTracks(homeData.dailySongs, 0)}
            />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={6}
              paddingHorizontal={4}>
              {homeData.dailySongs.map((song, index) => (
                <SongListItem
                  key={song.hash}
                  track={song}
                  active={song.hash === activeHash}
                  onPress={() => void playerActions.playTracks(homeData.dailySongs, index)}
                  onMore={() => setActionTrack(song)}
                />
              ))}
            </YStack>
          </YStack>
        ) : null}

        {homeData.playlists.length ? (
          <YStack gap={12}>
            <SectionHeader title="推荐歌单" subtitle="此刻大家都在收藏" />
            <XStack flexWrap="wrap" gap={14}>
              {homeData.playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.gid}
                  title={playlist.title}
                  coverUrl={playlist.coverUrl}
                  playCountText={playlist.playCountText}
                  width={playlistCardWidth}
                  onPress={() =>
                    router.push({
                      pathname: '/playlist/[id]',
                      params: {
                        id: playlist.gid,
                        name: playlist.title,
                        cover: playlist.coverUrl ?? '',
                      },
                    })
                  }
                />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {homeData.rankCards.length ? (
          <YStack gap={12}>
            <SectionHeader title="排行榜" subtitle="现在大家都在听什么" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rankList}>
              {homeData.rankCards.map((card) => (
                <RankCard
                  key={card.id}
                  title={card.title}
                  coverUrl={card.coverUrl}
                  songs={card.songs}
                  activeHash={activeHash}
                  onPressSong={(index) => void playerActions.playTracks(card.songs, index)}
                  onPlayAll={() => void playerActions.playTracks(card.songs, 0)}
                />
              ))}
            </ScrollView>
          </YStack>
        ) : null}

        {homeData.newSongs.length ? (
          <YStack gap={10}>
            <SectionHeader
              title="新歌速递"
              subtitle="最新上架的好声音"
              actionLabel="播放全部"
              onAction={() => void playerActions.playTracks(homeData.newSongs, 0)}
            />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={6}
              paddingHorizontal={4}>
              {homeData.newSongs.map((song, index) => (
                <SongListItem
                  key={`new-${song.hash}`}
                  track={song}
                  active={song.hash === activeHash}
                  onPress={() => void playerActions.playTracks(homeData.newSongs, index)}
                  onMore={() => setActionTrack(song)}
                />
              ))}
            </YStack>
          </YStack>
        ) : null}
      </ScrollView>

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: 16,
    gap: 22,
  },
  bannerList: {
    gap: 12,
  },
  bannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 34,
    paddingBottom: 12,
  },
  rankList: {
    gap: 14,
    paddingRight: 4,
  },
});
