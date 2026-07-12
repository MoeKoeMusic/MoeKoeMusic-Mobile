import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import {
  AlbumCard,
  ArtistCard,
  MvCard,
  PlaylistCard,
} from '@/components/ui/search-result-cards';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { isLoggedIn } from '@/features/account/user-api';
import { playerActions, useHasTrack, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import {
  fetchHotKeywords,
  fetchSuggestions,
  searchAlbums,
  searchArtists,
  searchComplex,
  searchMvs,
  searchPlaylists,
  searchSongs,
  type ComplexSearchResult,
  type SearchAlbum,
  type SearchArtist,
  type SearchKeyword,
  type SearchMv,
  type SearchPlaylist,
  type SearchTab,
} from '@/features/search/search-api';
import { usePalette } from '@/hooks/use-palette';

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: 'complex', label: '综合' },
  { value: 'song', label: '单曲' },
  { value: 'special', label: '歌单' },
  { value: 'album', label: '专辑' },
  { value: 'mv', label: 'MV' },
  { value: 'author', label: '歌手' },
];

/** 各标签的网格列数，与桌面端的网格布局对应（移动端窄屏收窄）。 */
const TAB_COLUMNS: Record<SearchTab, number> = {
  complex: 1,
  song: 1,
  special: 2,
  album: 2,
  mv: 2,
  author: 3,
};

type ListItem = PlayerTrack | SearchPlaylist | SearchAlbum | SearchArtist | SearchMv;

type ResultsState = {
  keyword: string;
  tab: SearchTab;
  items: ListItem[];
  complex: ComplexSearchResult | null;
  page: number;
  total: number;
  hasMore: boolean;
  searching: boolean;
  loadingMore: boolean;
  error: string;
};

const EMPTY_RESULTS: ResultsState = {
  keyword: '',
  tab: 'complex',
  items: [],
  complex: null,
  page: 0,
  total: 0,
  hasMore: false,
  searching: false,
  loadingMore: false,
  error: '',
};

type FetchPage = {
  items: ListItem[];
  total: number;
  hasMore: boolean;
};

async function fetchTabPage(
  tab: Exclude<SearchTab, 'complex'>,
  keyword: string,
  page: number
): Promise<FetchPage> {
  if (tab === 'song') {
    const result = await searchSongs(keyword, page);
    return { items: result.tracks, total: result.total, hasMore: result.hasMore };
  }
  if (tab === 'special') {
    return searchPlaylists(keyword, page);
  }
  if (tab === 'album') {
    return searchAlbums(keyword, page);
  }
  if (tab === 'mv') {
    return searchMvs(keyword, page);
  }
  return searchArtists(keyword, page);
}

function itemKey(item: ListItem): string {
  if ('hash' in item) {
    return item.hash;
  }
  return item.id;
}

export default function SearchScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();
  const inputRef = useRef<TextInput>(null);
  const searchIdRef = useRef(0);

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('complex');
  const [hotKeywords, setHotKeywords] = useState<SearchKeyword[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<ResultsState>(EMPTY_RESULTS);
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHotKeywords()
      .then((keywords) => {
        if (!cancelled) {
          setHotKeywords(keywords);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed === results.keyword) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions(trimmed)
        .then((items) => {
          startTransition(() => setSuggestions(items));
        })
        .catch(() => {});
    }, 280);

    return () => clearTimeout(timer);
  }, [query, results.keyword]);

  async function runSearch(keyword: string, tab: SearchTab) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }

    const searchId = ++searchIdRef.current;
    setResults({ ...EMPTY_RESULTS, keyword: trimmed, tab, searching: true });

    try {
      if (tab === 'complex') {
        const complex = await searchComplex(trimmed);
        if (searchId !== searchIdRef.current) {
          return;
        }
        startTransition(() => {
          setResults({
            ...EMPTY_RESULTS,
            keyword: trimmed,
            tab,
            complex,
            searching: false,
          });
        });
        return;
      }

      const page = await fetchTabPage(tab, trimmed, 1);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          ...EMPTY_RESULTS,
          keyword: trimmed,
          tab,
          items: page.items,
          page: 1,
          total: page.total,
          hasMore: page.hasMore,
          searching: false,
        });
      });
    } catch (error) {
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          ...EMPTY_RESULTS,
          keyword: trimmed,
          tab,
          error: error instanceof Error ? error.message : '搜索失败，请稍后重试',
        });
      });
    }
  }

  async function commitSearch(keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }

    Keyboard.dismiss();
    setQuery(trimmed);
    setSuggestions([]);
    await runSearch(trimmed, activeTab);
  }

  function changeTab(tab: SearchTab) {
    if (tab === activeTab) {
      return;
    }
    setActiveTab(tab);
    if (results.keyword) {
      void runSearch(results.keyword, tab);
    }
  }

  async function loadMore() {
    if (
      results.tab === 'complex' ||
      !results.hasMore ||
      results.loadingMore ||
      results.searching
    ) {
      return;
    }

    const searchId = searchIdRef.current;
    const { keyword, tab } = results;
    setResults((current) => ({ ...current, loadingMore: true }));

    try {
      const nextPage = results.page + 1;
      const page = await fetchTabPage(tab, keyword, nextPage);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults((current) => {
          const seen = new Set(current.items.map(itemKey));
          const fresh = page.items.filter((item) => !seen.has(itemKey(item)));
          return {
            ...current,
            items: [...current.items, ...fresh],
            page: nextPage,
            hasMore: page.hasMore,
            loadingMore: false,
          };
        });
      });
    } catch {
      if (searchId === searchIdRef.current) {
        setResults((current) => ({ ...current, loadingMore: false, hasMore: false }));
      }
    }
  }

  function resetSearch() {
    searchIdRef.current += 1;
    setQuery('');
    setSuggestions([]);
    setResults(EMPTY_RESULTS);
    inputRef.current?.focus();
  }

  /* ---------- 导航 ---------- */

  function openPlaylist(playlist: SearchPlaylist) {
    router.push({
      pathname: '/playlist/[id]',
      params: { id: playlist.id, name: playlist.name, cover: playlist.coverUrl ?? '' },
    });
  }

  function openAlbum(album: SearchAlbum) {
    router.push({
      pathname: '/album/[id]',
      params: {
        id: album.id,
        name: album.name,
        cover: album.coverUrl ?? '',
        artist: album.artist,
        date: album.publishDate,
      },
    });
  }

  function openArtist(artist: SearchArtist) {
    router.push({
      pathname: '/artist/[id]',
      params: { id: artist.id, name: artist.name, avatar: artist.avatarUrl ?? '' },
    });
  }

  function openMv(mv: SearchMv) {
    router.push({
      pathname: '/mv/[hash]',
      params: { hash: mv.hash, title: mv.name },
    });
  }

  const showResults = Boolean(results.keyword) && !suggestions.length;
  const showSuggestions = suggestions.length > 0;
  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;
  const columns = TAB_COLUMNS[results.tab];

  const hasComplexContent = Boolean(
    results.complex &&
      (results.complex.artists.length ||
        results.complex.songs.length ||
        results.complex.albums.length ||
        results.complex.playlists.length ||
        results.complex.mvs.length)
  );
  const hasContent = results.tab === 'complex' ? hasComplexContent : results.items.length > 0;

  /* ---------- 综合页的分区标题 ---------- */

  function SectionHeader({
    title,
    total,
    moreTab,
  }: {
    title: string;
    total?: number;
    moreTab?: SearchTab;
  }) {
    return (
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={16}>
        <Text color={palette.text} fontSize={17} fontWeight="700">
          {title}
        </Text>
        {moreTab ? (
          <XStack
            alignItems="center"
            gap={2}
            pressStyle={{ opacity: 0.6 }}
            onPress={() => changeTab(moreTab)}>
            <Text color={palette.textTertiary} fontSize={12.5}>
              查看更多{total ? `(${total})` : ''}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={palette.textTertiary} />
          </XStack>
        ) : null}
      </XStack>
    );
  }

  function renderComplex(complex: ComplexSearchResult) {
    const songs = complex.songs.slice(0, 5);
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: listBottomInset, gap: 22 }}>
        {complex.artists.length ? (
          <YStack gap={10}>
            <SectionHeader title="歌手" moreTab="author" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {complex.artists.map((artist) => (
                <ArtistCard key={artist.id} item={artist} width={104} onPress={() => openArtist(artist)} />
              ))}
            </ScrollView>
          </YStack>
        ) : null}

        {songs.length ? (
          <YStack gap={6}>
            <SectionHeader title="单曲" total={complex.songsTotal} moreTab="song" />
            <YStack paddingHorizontal={12}>
              {songs.map((song, index) => (
                <SongListItem
                  key={`${song.hash}-${index}`}
                  track={song}
                  active={song.hash === activeHash}
                  onPress={() => void playerActions.playTracks(songs, index)}
                  onMore={() => setActionTrack(song)}
                />
              ))}
            </YStack>
          </YStack>
        ) : null}

        {complex.playlists.length ? (
          <YStack gap={10}>
            <SectionHeader title="歌单" total={complex.playlistsTotal} moreTab="special" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {complex.playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} item={playlist} width={136} onPress={() => openPlaylist(playlist)} />
              ))}
            </ScrollView>
          </YStack>
        ) : null}

        {complex.albums.length ? (
          <YStack gap={10}>
            <SectionHeader title="专辑" total={complex.albumsTotal} moreTab="album" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {complex.albums.map((album) => (
                <AlbumCard key={album.id} item={album} width={136} onPress={() => openAlbum(album)} />
              ))}
            </ScrollView>
          </YStack>
        ) : null}

        {complex.mvs.length ? (
          <YStack gap={10}>
            <SectionHeader title="MV" total={complex.mvsTotal} moreTab="mv" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {complex.mvs.map((mv) => (
                <MvCard key={mv.hash} item={mv} width={210} onPress={() => openMv(mv)} />
              ))}
            </ScrollView>
          </YStack>
        ) : null}
      </ScrollView>
    );
  }

  function renderGridItem(item: ListItem, index: number) {
    if (results.tab === 'song') {
      const song = item as PlayerTrack;
      return (
        <SongListItem
          track={song}
          active={song.hash === activeHash}
          onPress={() => void playerActions.playTracks(results.items as PlayerTrack[], index)}
          onMore={() => setActionTrack(song)}
        />
      );
    }
    if (results.tab === 'special') {
      const playlist = item as SearchPlaylist;
      return <PlaylistCard item={playlist} onPress={() => openPlaylist(playlist)} />;
    }
    if (results.tab === 'album') {
      const album = item as SearchAlbum;
      return <AlbumCard item={album} onPress={() => openAlbum(album)} />;
    }
    if (results.tab === 'mv') {
      const mv = item as SearchMv;
      return <MvCard item={mv} onPress={() => openMv(mv)} />;
    }
    const artist = item as SearchArtist;
    return <ArtistCard item={artist} onPress={() => openArtist(artist)} />;
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <YStack
        alignSelf="center"
        width="100%"
        maxWidth={MaxContentWidth}
        flex={1}
        paddingTop={insets.top + 10}
        gap={12}>
        <XStack alignItems="center" gap={10} paddingHorizontal={16}>
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

          <XStack
            flex={1}
            alignItems="center"
            gap={8}
            height={44}
            paddingHorizontal={14}
            borderRadius={22}
            backgroundColor={palette.card}
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={palette.border}>
            <Ionicons name="search" size={17} color={palette.textTertiary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => void commitSearch(query)}
              placeholder="歌曲、歌手、专辑"
              placeholderTextColor={palette.textTertiary}
              returnKeyType="search"
              autoCorrect={false}
              autoFocus
              style={[styles.input, { color: palette.text }]}
            />
            {query ? (
              <XStack
                width={22}
                height={22}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                backgroundColor={palette.cardAlt}
                pressStyle={{ opacity: 0.6 }}
                onPress={resetSearch}>
                <Ionicons name="close" size={13} color={palette.textSecondary} />
              </XStack>
            ) : null}
          </XStack>
        </XStack>

        {showResults ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {SEARCH_TABS.map((tab) => {
              const active = tab.value === activeTab;
              return (
                <XStack
                  key={tab.value}
                  paddingHorizontal={15}
                  paddingVertical={7}
                  borderRadius={999}
                  backgroundColor={active ? palette.accent : palette.card}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={active ? palette.accent : palette.border}
                  transition="quickest"
                  pressStyle={{ opacity: 0.7, scale: 0.97 }}
                  onPress={() => changeTab(tab.value)}>
                  <Text
                    color={active ? '#FFFFFF' : palette.textSecondary}
                    fontSize={13}
                    fontWeight={active ? '700' : '500'}>
                    {tab.label}
                  </Text>
                </XStack>
              );
            })}
          </ScrollView>
        ) : null}

        {showSuggestions ? (
          <YStack paddingHorizontal={16} gap={2}>
            {suggestions.map((suggestion) => (
              <XStack
                key={suggestion}
                alignItems="center"
                gap={10}
                paddingVertical={12}
                paddingHorizontal={10}
                borderRadius={12}
                transition="quickest"
                pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                onPress={() => void commitSearch(suggestion)}>
                <Ionicons name="search-outline" size={15} color={palette.textTertiary} />
                <Text flex={1} color={palette.text} fontSize={14.5} numberOfLines={1}>
                  {suggestion}
                </Text>
                <Ionicons name="arrow-up-outline" size={14} color={palette.textTertiary} style={{ transform: [{ rotate: '45deg' }] }} />
              </XStack>
            ))}
          </YStack>
        ) : showResults ? (
          results.searching ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={12}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : results.error ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={32}>
              <Ionicons name="cloud-offline-outline" size={38} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13.5} textAlign="center">
                {results.error}
              </Text>
              <Text
                color={palette.accent}
                fontSize={14}
                fontWeight="600"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => void runSearch(results.keyword, results.tab)}
                suppressHighlighting>
                重试
              </Text>
            </YStack>
          ) : !hasContent ? (
            isLoggedIn() ? (
              <YStack flex={1} alignItems="center" justifyContent="center" gap={10}>
                <Ionicons name="search" size={38} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13.5}>
                  没有找到相关内容
                </Text>
              </YStack>
            ) : (
              <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={32}>
                <Ionicons name="lock-closed-outline" size={38} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13.5} textAlign="center" lineHeight={20}>
                  酷狗概念版的搜索需要登录后才能获取结果，请先登录
                </Text>
                <XStack
                  alignItems="center"
                  gap={6}
                  paddingHorizontal={20}
                  paddingVertical={10}
                  borderRadius={999}
                  backgroundColor={palette.accent}
                  pressStyle={{ opacity: 0.75, scale: 0.98 }}
                  onPress={() => router.push('/login')}>
                  <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontSize={14} fontWeight="700">
                    去登录
                  </Text>
                </XStack>
              </YStack>
            )
          ) : results.tab === 'complex' && results.complex ? (
            renderComplex(results.complex)
          ) : (
            <FlatList
              key={results.tab}
              data={results.items}
              numColumns={columns}
              columnWrapperStyle={columns > 1 ? { gap: 14 } : undefined}
              keyExtractor={(item, index) => `${itemKey(item)}-${index}`}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.4}
              onEndReached={() => void loadMore()}
              contentContainerStyle={{
                paddingHorizontal: columns > 1 ? 16 : 12,
                paddingBottom: listBottomInset,
                gap: columns > 1 ? 18 : 0,
              }}
              ListHeaderComponent={
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  paddingHorizontal={columns > 1 ? 0 : 6}
                  paddingBottom={8}>
                  <Text color={palette.textTertiary} fontSize={12.5}>
                    {results.total > 0 ? `共 ${results.total} 条` : `${results.items.length} 条`}
                  </Text>
                  {results.tab === 'song' ? (
                    <XStack
                      alignItems="center"
                      gap={5}
                      pressStyle={{ opacity: 0.6 }}
                      onPress={() =>
                        void playerActions.playTracks(results.items as PlayerTrack[], 0)
                      }>
                      <Ionicons name="play-circle" size={17} color={palette.accent} />
                      <Text color={palette.accent} fontSize={13.5} fontWeight="600">
                        播放全部
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>
              }
              ListFooterComponent={
                results.loadingMore ? (
                  <XStack justifyContent="center" paddingVertical={16}>
                    <Spinner color={palette.accent} />
                  </XStack>
                ) : null
              }
              renderItem={({ item, index }) => renderGridItem(item, index)}
            />
          )
        ) : (
          <YStack paddingHorizontal={16} gap={14}>
            {hotKeywords.length ? (
              <>
                <XStack alignItems="center" gap={6}>
                  <Ionicons name="flame" size={16} color={palette.accent} />
                  <Text color={palette.text} fontSize={16} fontWeight="700">
                    热搜榜
                  </Text>
                </XStack>
                <XStack flexWrap="wrap" gap={10}>
                  {hotKeywords.map((item, index) => (
                    <XStack
                      key={item.keyword}
                      alignItems="center"
                      gap={7}
                      paddingHorizontal={13}
                      paddingVertical={9}
                      borderRadius={999}
                      backgroundColor={palette.card}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      transition="quickest"
                      pressStyle={{ opacity: 0.65, scale: 0.97 }}
                      onPress={() => void commitSearch(item.keyword)}>
                      <Text
                        color={index < 3 ? palette.accent : palette.textTertiary}
                        fontSize={12.5}
                        fontWeight="800">
                        {index + 1}
                      </Text>
                      <Text color={palette.text} fontSize={13.5} fontWeight="500">
                        {item.keyword}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              </>
            ) : null}
          </YStack>
        )}
      </YStack>

      <RNView
        pointerEvents="box-none"
        style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
        <RNView pointerEvents="box-none" style={styles.miniDockInner}>
          <MiniPlayer />
        </RNView>
      </RNView>

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
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
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
