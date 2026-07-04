import { Ionicons } from '@expo/vector-icons';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { SongListItem } from '@/components/ui/song-list-item';
import { MaxContentWidth } from '@/constants/theme';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import {
  fetchHotKeywords,
  fetchSuggestions,
  searchSongs,
  type SearchKeyword,
} from '@/features/search/search-api';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';

type ResultsState = {
  keyword: string;
  tracks: PlayerTrack[];
  page: number;
  total: number;
  hasMore: boolean;
  searching: boolean;
  loadingMore: boolean;
  error: string;
};

const EMPTY_RESULTS: ResultsState = {
  keyword: '',
  tracks: [],
  page: 0,
  total: 0,
  hasMore: false,
  searching: false,
  loadingMore: false,
  error: '',
};

export default function SearchScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const { track } = usePlayer();
  const inputRef = useRef<TextInput>(null);
  const searchIdRef = useRef(0);

  const [query, setQuery] = useState('');
  const [hotKeywords, setHotKeywords] = useState<SearchKeyword[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<ResultsState>(EMPTY_RESULTS);

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

  async function commitSearch(keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }

    Keyboard.dismiss();
    setQuery(trimmed);
    setSuggestions([]);

    const searchId = ++searchIdRef.current;
    setResults({ ...EMPTY_RESULTS, keyword: trimmed, searching: true });

    try {
      const page = await searchSongs(trimmed, 1);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          keyword: trimmed,
          tracks: page.tracks,
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
          error: error instanceof Error ? error.message : '搜索失败，请稍后重试',
        });
      });
    }
  }

  async function loadMore() {
    if (!results.hasMore || results.loadingMore || results.searching) {
      return;
    }

    const searchId = searchIdRef.current;
    setResults((current) => ({ ...current, loadingMore: true }));

    try {
      const nextPage = results.page + 1;
      const page = await searchSongs(results.keyword, nextPage);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults((current) => {
          const seen = new Set(current.tracks.map((item) => item.hash));
          return {
            ...current,
            tracks: [...current.tracks, ...page.tracks.filter((item) => !seen.has(item.hash))],
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
  }

  const showResults = Boolean(results.keyword) && !suggestions.length;
  const showSuggestions = suggestions.length > 0;
  const activeHash = track?.hash;

  return (
    <View flex={1} backgroundColor={palette.background}>
      <YStack
        alignSelf="center"
        width="100%"
        maxWidth={MaxContentWidth}
        flex={1}
        paddingTop={insets.top + 14}
        gap={14}>
        <YStack paddingHorizontal={16} gap={14}>
          <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
            搜索
          </Text>

          <XStack alignItems="center" gap={10}>
            <XStack
              flex={1}
              alignItems="center"
              gap={8}
              height={46}
              paddingHorizontal={14}
              borderRadius={23}
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

            {results.keyword || query ? (
              <Text
                color={palette.accent}
                fontSize={14.5}
                fontWeight="600"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => {
                  Keyboard.dismiss();
                  resetSearch();
                }}
                suppressHighlighting>
                取消
              </Text>
            ) : null}
          </XStack>
        </YStack>

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
                onPress={() => void commitSearch(results.keyword)}
                suppressHighlighting>
                重试
              </Text>
            </YStack>
          ) : !results.tracks.length ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={10}>
              <Ionicons name="musical-note" size={38} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13.5}>
                没有找到相关歌曲
              </Text>
            </YStack>
          ) : (
            <FlatList
              data={results.tracks}
              keyExtractor={(item, index) => `${item.hash}-${index}`}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.4}
              onEndReached={() => void loadMore()}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: dockInset }}
              ListHeaderComponent={
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  paddingHorizontal={6}
                  paddingBottom={8}>
                  <Text color={palette.textTertiary} fontSize={12.5}>
                    {results.total > 0 ? `共 ${results.total} 首` : `${results.tracks.length} 首`}
                  </Text>
                  <XStack
                    alignItems="center"
                    gap={5}
                    pressStyle={{ opacity: 0.6 }}
                    onPress={() => void playerActions.playTracks(results.tracks, 0)}>
                    <Ionicons name="play-circle" size={17} color={palette.accent} />
                    <Text color={palette.accent} fontSize={13.5} fontWeight="600">
                      播放全部
                    </Text>
                  </XStack>
                </XStack>
              }
              ListFooterComponent={
                results.loadingMore ? (
                  <XStack justifyContent="center" paddingVertical={16}>
                    <Spinner color={palette.accent} />
                  </XStack>
                ) : null
              }
              renderItem={({ item, index }) => (
                <SongListItem
                  track={item}
                  active={item.hash === activeHash}
                  onPress={() => void playerActions.playTracks(results.tracks, index)}
                />
              )}
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
});
