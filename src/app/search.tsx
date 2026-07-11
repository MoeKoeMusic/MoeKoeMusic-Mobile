import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, TextInput, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import {
  AlbumResultRow,
  ArtistResultRow,
  PlaylistResultRow,
} from '@/components/ui/search-result-rows';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { playerActions, useHasTrack, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import {
  fetchHotKeywords,
  fetchSuggestions,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  searchSongs,
  type SearchAlbum,
  type SearchArtist,
  type SearchKeyword,
  type SearchPlaylist,
  type SearchTab,
} from '@/features/search/search-api';
import { usePalette } from '@/hooks/use-palette';

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: 'song', label: '单曲' },
  { value: 'special', label: '歌单' },
  { value: 'album', label: '专辑' },
  { value: 'author', label: '歌手' },
];

type ResultsState = {
  keyword: string;
  tab: SearchTab;
  items: (PlayerTrack | SearchPlaylist | SearchAlbum | SearchArtist)[];
  page: number;
  total: number;
  hasMore: boolean;
  searching: boolean;
  loadingMore: boolean;
  error: string;
};

const EMPTY_RESULTS: ResultsState = {
  keyword: '',
  tab: 'song',
  items: [],
  page: 0,
  total: 0,
  hasMore: false,
  searching: false,
  loadingMore: false,
  error: '',
};

type FetchPage = {
  items: ResultsState['items'];
  total: number;
  hasMore: boolean;
};

async function fetchTabPage(tab: SearchTab, keyword: string, page: number): Promise<FetchPage> {
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
  return searchArtists(keyword, page);
}

function itemKey(item: ResultsState['items'][number]): string {
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
  const [activeTab, setActiveTab] = useState<SearchTab>('song');
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
      const page = await fetchTabPage(tab, trimmed, 1);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          keyword: trimmed,
          tab,
          items: page.items,
          page: 1,
          total: page.total,
          hasMore: page.hasMore,
          searching: false,
          loadingMore: false,
          error: '',
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
    if (!results.hasMore || results.loadingMore || results.searching) {
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

  const showResults = Boolean(results.keyword) && !suggestions.length;
  const showSuggestions = suggestions.length > 0;
  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;

  const songTracks = results.tab === 'song' ? (results.items as PlayerTrack[]) : [];

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
          <XStack paddingHorizontal={16} gap={8}>
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
          </XStack>
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
          ) : !results.items.length ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={10}>
              <Ionicons name="search" size={38} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13.5}>
                没有找到相关内容
              </Text>
            </YStack>
          ) : (
            <FlatList
              data={results.items}
              keyExtractor={(item, index) => `${itemKey(item)}-${index}`}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.4}
              onEndReached={() => void loadMore()}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: listBottomInset }}
              ListHeaderComponent={
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  paddingHorizontal={6}
                  paddingBottom={8}>
                  <Text color={palette.textTertiary} fontSize={12.5}>
                    {results.total > 0 ? `共 ${results.total} 条` : `${results.items.length} 条`}
                  </Text>
                  {results.tab === 'song' ? (
                    <XStack
                      alignItems="center"
                      gap={5}
                      pressStyle={{ opacity: 0.6 }}
                      onPress={() => void playerActions.playTracks(songTracks, 0)}>
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
              renderItem={({ item, index }) => {
                if (results.tab === 'song') {
                  const track = item as PlayerTrack;
                  return (
                    <SongListItem
                      track={track}
                      active={track.hash === activeHash}
                      onPress={() => void playerActions.playTracks(songTracks, index)}
                      onMore={() => setActionTrack(track)}
                    />
                  );
                }
                if (results.tab === 'special') {
                  const playlist = item as SearchPlaylist;
                  return (
                    <PlaylistResultRow
                      item={playlist}
                      onPress={() =>
                        router.push({
                          pathname: '/playlist/[id]',
                          params: { id: playlist.id, name: playlist.name, cover: playlist.coverUrl ?? '' },
                        })
                      }
                    />
                  );
                }
                if (results.tab === 'album') {
                  const album = item as SearchAlbum;
                  return (
                    <AlbumResultRow
                      item={album}
                      onPress={() =>
                        router.push({
                          pathname: '/album/[id]',
                          params: {
                            id: album.id,
                            name: album.name,
                            cover: album.coverUrl ?? '',
                            artist: album.artist,
                            date: album.publishDate,
                          },
                        })
                      }
                    />
                  );
                }
                const artist = item as SearchArtist;
                return (
                  <ArtistResultRow
                    item={artist}
                    onPress={() => {
                      setActiveTab('song');
                      void runSearch(artist.name, 'song');
                    }}
                  />
                );
              }}
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
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
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
