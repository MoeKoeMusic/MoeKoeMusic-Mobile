import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { PlaylistCard } from '@/components/ui/playlist-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SongListItem } from '@/components/ui/song-list-item';
import { MaxContentWidth, type AppPalette } from '@/constants/theme';
import {
  fetchCategoryPlaylists,
  fetchNewAlbums,
  fetchNewSongs,
  fetchPlaylistCategories,
  fetchRankGroups,
  type AlbumRegion,
  type DiscoverAlbum,
  type DiscoverCategory,
  type DiscoverPlaylist,
  type RankGroup,
} from '@/features/discover/discover-api';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';

const DISCOVER_TABS = [
  { value: 'playlist', label: '歌单' },
  { value: 'ranking', label: '榜单' },
  { value: 'album', label: '新碟' },
  { value: 'song', label: '新歌' },
] as const;

type DiscoverTab = (typeof DISCOVER_TABS)[number]['value'];

const ALBUM_REGIONS: { value: AlbumRegion | 'all'; label: string }[] = [
  { value: 'all', label: '推荐' },
  { value: 'chn', label: '华语' },
  { value: 'eur', label: '欧美' },
  { value: 'jpn', label: '日本' },
  { value: 'kor', label: '韩国' },
];

function useGridMetrics() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth) - 32;
  const cardWidth = Math.floor((contentWidth - 24) / 3);
  return { cardWidth };
}

function PaneStatus({
  palette,
  loading,
  error,
  emptyText,
  onRetry,
}: {
  palette: AppPalette;
  loading: boolean;
  error: string;
  emptyText: string;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <YStack alignItems="center" paddingVertical={70}>
        <Spinner size="large" color={palette.accent} />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack alignItems="center" paddingVertical={60} gap={12} paddingHorizontal={28}>
        <Ionicons name="cloud-offline-outline" size={36} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={13} textAlign="center">
          {error}
        </Text>
        <Text
          color={palette.accent}
          fontSize={14}
          fontWeight="600"
          pressStyle={{ opacity: 0.6 }}
          onPress={onRetry}
          suppressHighlighting>
          重试
        </Text>
      </YStack>
    );
  }

  return (
    <YStack alignItems="center" paddingVertical={60} gap={8}>
      <Ionicons name="musical-note" size={34} color={palette.textTertiary} />
      <Text color={palette.textTertiary} fontSize={13}>
        {emptyText}
      </Text>
    </YStack>
  );
}

function CategoryChip({
  label,
  active,
  palette,
  onPress,
}: {
  label: string;
  active: boolean;
  palette: AppPalette;
  onPress: () => void;
}) {
  return (
    <XStack
      paddingHorizontal={13}
      height={32}
      alignItems="center"
      borderRadius={999}
      backgroundColor={active ? palette.accentSoft : palette.card}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={active ? palette.accent : palette.border}
      transition="quickest"
      pressStyle={{ opacity: 0.7, scale: 0.97 }}
      onPress={onPress}>
      <Text
        color={active ? palette.accent : palette.textSecondary}
        fontSize={12.5}
        fontWeight={active ? '700' : '500'}>
        {label}
      </Text>
    </XStack>
  );
}

/* ---------------- 歌单 ---------------- */

function PlaylistPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const { cardWidth } = useGridMetrics();
  const requestIdRef = useRef(0);

  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [mainTag, setMainTag] = useState(0);
  const [sonTag, setSonTag] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<DiscoverPlaylist[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const activeTag = sonTag ?? mainTag;
  const activeMain = categories.find((item) => item.tagId === mainTag);

  useEffect(() => {
    fetchPlaylistCategories()
      .then((items) => startTransition(() => setCategories(items)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadPage(activeTag, 1);
     
  }, [activeTag]);

  async function loadPage(tagId: number, nextPage: number) {
    const requestId = ++requestIdRef.current;
    if (nextPage === 1) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchCategoryPlaylists(tagId, nextPage);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setPlaylists((current) => {
          if (nextPage === 1) {
            return result.playlists;
          }

          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.playlists.filter((item) => !seen.has(item.id))];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
        setLoading(false);
        setLoadingMore(false);
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setLoading(false);
        setLoadingMore(false);
        if (nextPage === 1) {
          setPlaylists([]);
          setError(caught instanceof Error ? caught.message : '歌单加载失败');
        } else {
          setHasMore(false);
        }
      });
    }
  }

  return (
    <FlatList
      data={loading || error ? [] : playlists}
      keyExtractor={(item) => item.id}
      numColumns={3}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loading && !loadingMore) {
          void loadPage(activeTag, page + 1);
        }
      }}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        gap: 16,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        <YStack gap={10}>
          {categories.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {categories.map((item) => (
                <CategoryChip
                  key={item.tagId}
                  label={item.name}
                  active={item.tagId === mainTag}
                  palette={palette}
                  onPress={() => {
                    setMainTag(item.tagId);
                    // 父分类本身查不到歌单，切换后默认选中第一个子分类
                    setSonTag(item.sons.length ? item.sons[0].tagId : null);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
          {activeMain && activeMain.sons.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {activeMain.sons.map((son) => (
                <CategoryChip
                  key={son.tagId}
                  label={son.name}
                  active={son.tagId === sonTag}
                  palette={palette}
                  onPress={() => setSonTag(son.tagId)}
                />
              ))}
            </ScrollView>
          ) : null}
        </YStack>
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="这个分类暂时没有歌单"
          onRetry={() => void loadPage(activeTag, 1)}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <XStack justifyContent="center" paddingVertical={16}>
            <Spinner color={palette.accent} />
          </XStack>
        ) : null
      }
      renderItem={({ item }) => (
        <PlaylistCard
          title={item.title}
          coverUrl={item.coverUrl}
          playCountText={item.playCountText}
          width={cardWidth}
          onPress={() =>
            router.push({
              pathname: '/playlist/[id]',
              params: { id: item.id, name: item.title, cover: item.coverUrl ?? '' },
            })
          }
        />
      )}
    />
  );
}

/* ---------------- 榜单 ---------------- */

function RankingPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const [ranks, setRanks] = useState<RankGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const items = await fetchRankGroups();
      startTransition(() => {
        setRanks(items);
        setLoading(false);
      });
    } catch (caught) {
      startTransition(() => {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : '榜单加载失败');
      });
    }
  }

  return (
    <FlatList
      data={loading || error ? [] : ranks}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        paddingHorizontal: 12,
        paddingBottom: bottomInset,
      }}
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="暂时没有可用的榜单"
          onRetry={() => void load()}
        />
      }
      renderItem={({ item }) => (
        <XStack
          alignItems="center"
          gap={13}
          paddingVertical={9}
          paddingHorizontal={6}
          borderRadius={16}
          transition="quickest"
          pressStyle={{ opacity: 0.7, backgroundColor: palette.cardAlt }}
          onPress={() =>
            router.push({
              pathname: '/rank/[id]',
              params: { id: item.id, name: item.name, cover: item.coverUrl ?? '' },
            })
          }>
          <Artwork uri={item.coverUrl} size={58} radius={14} />
          <YStack flex={1} gap={3}>
            <Text color={palette.text} fontSize={15} fontWeight="700" numberOfLines={1}>
              {item.name}
            </Text>
            {item.intro ? (
              <Text color={palette.textTertiary} fontSize={12} numberOfLines={1}>
                {item.intro}
              </Text>
            ) : null}
          </YStack>
          <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
        </XStack>
      )}
    />
  );
}

/* ---------------- 新碟 ---------------- */

function AlbumPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const { cardWidth } = useGridMetrics();
  const [albums, setAlbums] = useState<DiscoverAlbum[]>([]);
  const [region, setRegion] = useState<AlbumRegion | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const items = await fetchNewAlbums();
      startTransition(() => {
        setAlbums(items);
        setLoading(false);
      });
    } catch (caught) {
      startTransition(() => {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : '新碟加载失败');
      });
    }
  }

  const visible = region === 'all' ? albums : albums.filter((item) => item.region === region);

  return (
    <FlatList
      data={loading || error ? [] : visible}
      keyExtractor={(item) => `${item.region}-${item.id}`}
      numColumns={3}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        gap: 16,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {ALBUM_REGIONS.map((item) => (
            <CategoryChip
              key={item.value}
              label={item.label}
              active={item.value === region}
              palette={palette}
              onPress={() => setRegion(item.value)}
            />
          ))}
        </ScrollView>
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="这个地区暂时没有新专辑"
          onRetry={() => void load()}
        />
      }
      renderItem={({ item }) => (
        <YStack
          width={cardWidth}
          gap={7}
          transition="quickest"
          pressStyle={{ opacity: 0.75, scale: 0.98 }}
          onPress={() =>
            router.push({
              pathname: '/album/[id]',
              params: {
                id: item.id,
                name: item.name,
                cover: item.coverUrl ?? '',
                artist: item.artist,
                date: item.publishDate,
              },
            })
          }>
          <Artwork uri={item.coverUrl} radius={16} />
          <YStack gap={2} paddingHorizontal={2}>
            <Text color={palette.text} fontSize={12.5} fontWeight="600" lineHeight={17} numberOfLines={2}>
              {item.name}
            </Text>
            <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
              {item.artist}
            </Text>
          </YStack>
        </YStack>
      )}
    />
  );
}

/* ---------------- 新歌 ---------------- */

function NewSongPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const { track } = usePlayer();
  const requestIdRef = useRef(0);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadPage(1);
     
  }, []);

  async function loadPage(nextPage: number) {
    const requestId = ++requestIdRef.current;
    if (nextPage === 1) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchNewSongs(nextPage);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setTracks((current) => {
          if (nextPage === 1) {
            return result.tracks;
          }

          const seen = new Set(current.map((item) => item.hash));
          return [...current, ...result.tracks.filter((item) => !seen.has(item.hash))];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
        setLoading(false);
        setLoadingMore(false);
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setLoading(false);
        setLoadingMore(false);
        if (nextPage === 1) {
          setError(caught instanceof Error ? caught.message : '新歌加载失败');
        } else {
          setHasMore(false);
        }
      });
    }
  }

  const activeHash = track?.hash;

  return (
    <FlatList
      data={loading || error ? [] : tracks}
      keyExtractor={(item, index) => `${item.hash}-${index}`}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loading && !loadingMore) {
          void loadPage(page + 1);
        }
      }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        paddingHorizontal: 12,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        tracks.length ? (
          <XStack
            alignItems="center"
            gap={5}
            paddingHorizontal={6}
            paddingBottom={8}
            alignSelf="flex-start"
            pressStyle={{ opacity: 0.6 }}
            onPress={() => void playerActions.playTracks(tracks, 0)}>
            <Ionicons name="play-circle" size={17} color={palette.accent} />
            <Text color={palette.accent} fontSize={13.5} fontWeight="600">
              播放全部
            </Text>
          </XStack>
        ) : null
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="暂时没有新歌"
          onRetry={() => void loadPage(1)}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <XStack justifyContent="center" paddingVertical={16}>
            <Spinner color={palette.accent} />
          </XStack>
        ) : null
      }
      renderItem={({ item, index }) => (
        <SongListItem
          track={item}
          active={item.hash === activeHash}
          onPress={() => void playerActions.playTracks(tracks, index)}
        />
      )}
    />
  );
}

/* ---------------- 页面 ---------------- */

export default function DiscoverScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const [tab, setTab] = useState<DiscoverTab>('playlist');
  const [mounted, setMounted] = useState<DiscoverTab[]>(['playlist']);

  function switchTab(next: DiscoverTab) {
    setTab(next);
    setMounted((current) => (current.includes(next) ? current : [...current, next]));
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <YStack flex={1} paddingTop={insets.top + 14} gap={14}>
        <YStack
          alignSelf="center"
          width="100%"
          maxWidth={MaxContentWidth}
          paddingHorizontal={16}
          gap={14}>
          <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
            发现
          </Text>
          <SegmentedControl options={DISCOVER_TABS} value={tab} onChange={switchTab} />
        </YStack>

        {mounted.includes('playlist') ? (
          <View flex={1} display={tab === 'playlist' ? 'flex' : 'none'}>
            <PlaylistPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('ranking') ? (
          <View flex={1} display={tab === 'ranking' ? 'flex' : 'none'}>
            <RankingPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('album') ? (
          <View flex={1} display={tab === 'album' ? 'flex' : 'none'}>
            <AlbumPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('song') ? (
          <View flex={1} display={tab === 'song' ? 'flex' : 'none'}>
            <NewSongPane bottomInset={dockInset} />
          </View>
        ) : null}
      </YStack>
    </View>
  );
}
