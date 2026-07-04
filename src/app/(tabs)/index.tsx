import { Image } from 'expo-image';
import { startTransition, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  loadHomeData,
  type HomeBanner,
  type HomeData,
  type HomeKeyword,
  type HomePlaylist,
  type HomeRankCard,
  type HomeSong,
} from '@/features/home/load-home-data';
import { useTheme } from '@/hooks/use-theme';
import { clearApiSession } from '@/lib/kugou-api';

type ScreenState = {
  homeData: HomeData | null;
  initialLoading: boolean;
  refreshing: boolean;
  errorMessage: string;
};

type HomePalette = {
  accent: string;
  accentSoft: string;
  heroSurface: string;
  cardSurface: string;
  cardStrong: string;
  warmSoft: string;
  border: string;
  placeholder: string;
  warningSurface: string;
  warningText: string;
};

function formatError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function formatUpdatedAt(updatedAt: number) {
  const date = new Date(updatedAt);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildPalette(isDark: boolean): HomePalette {
  if (isDark) {
    return {
      accent: '#8AB4FF',
      accentSoft: 'rgba(138, 180, 255, 0.16)',
      heroSurface: '#101826',
      cardSurface: '#14181F',
      cardStrong: '#1A2130',
      warmSoft: 'rgba(251, 191, 36, 0.14)',
      border: 'rgba(255, 255, 255, 0.08)',
      placeholder: '#202635',
      warningSurface: 'rgba(248, 113, 113, 0.12)',
      warningText: '#FCA5A5',
    };
  }

  return {
    accent: '#1D4ED8',
    accentSoft: '#E7EEFF',
    heroSurface: '#FBF3E4',
    cardSurface: '#FFFFFF',
    cardStrong: '#F7F8FB',
    warmSoft: '#FFF2DD',
    border: 'rgba(15, 23, 42, 0.08)',
    placeholder: '#E8ECF2',
    warningSurface: '#FFF1EC',
    warningText: '#C2410C',
  };
}

function Artwork({
  uri,
  width,
  height,
  borderRadius,
  placeholderColor,
}: {
  uri: string | null;
  width: DimensionValue;
  height: DimensionValue;
  borderRadius: number;
  placeholderColor: string;
}) {
  if (!uri) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: placeholderColor,
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width, height, borderRadius }}
      contentFit="cover"
      transition={180}
    />
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {eyebrow}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>
    </View>
  );
}

function KeywordChip({
  keyword,
  palette,
  textSecondary,
}: {
  keyword: HomeKeyword;
  palette: HomePalette;
  textSecondary: string;
}) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.keywordChip,
        {
          borderColor: palette.border,
          backgroundColor: palette.cardStrong,
        },
      ]}>
      <ThemedText type="smallBold">{keyword.keyword}</ThemedText>
      <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={1}>
        {keyword.reason}
      </ThemedText>
    </ThemedView>
  );
}

function SongRow({
  song,
  palette,
  textSecondary,
}: {
  song: HomeSong;
  palette: HomePalette;
  textSecondary: string;
}) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.songRow,
        {
          borderColor: palette.border,
          backgroundColor: palette.cardSurface,
        },
      ]}>
      <Artwork
        uri={song.coverUrl}
        width={58}
        height={58}
        borderRadius={16}
        placeholderColor={palette.placeholder}
      />
      <View style={styles.songInfo}>
        <ThemedText numberOfLines={1}>{song.title}</ThemedText>
        <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={1}>
          {song.artist}
        </ThemedText>
      </View>
      <ThemedView
        style={[
          styles.songNoteBadge,
          {
            backgroundColor: palette.accentSoft,
          },
        ]}>
        <ThemedText type="smallBold" style={{ color: palette.accent }} numberOfLines={1}>
          {song.note || '今日推荐'}
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

function PlaylistCard({
  playlist,
  palette,
  textSecondary,
}: {
  playlist: HomePlaylist;
  palette: HomePalette;
  textSecondary: string;
}) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.playlistCard,
        {
          borderColor: palette.border,
          backgroundColor: palette.cardSurface,
        },
      ]}>
      <Artwork
        uri={playlist.coverUrl}
        width="100%"
        height={154}
        borderRadius={20}
        placeholderColor={palette.placeholder}
      />
      <View style={styles.playlistMeta}>
        <ThemedText numberOfLines={2}>{playlist.title}</ThemedText>
        <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={2}>
          {playlist.description}
        </ThemedText>
      </View>
      <View style={styles.playlistFooter}>
        <ThemedView
          style={[
            styles.playlistTag,
            {
              backgroundColor: palette.warmSoft,
            },
          ]}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {playlist.tagText}
          </ThemedText>
        </ThemedView>
        <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={1}>
          {playlist.playCountText}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function RankCard({
  card,
  palette,
  textSecondary,
}: {
  card: HomeRankCard;
  palette: HomePalette;
  textSecondary: string;
}) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.rankCard,
        {
          borderColor: palette.border,
          backgroundColor: palette.cardStrong,
        },
      ]}>
      <View style={styles.rankCardTop}>
        <Artwork
          uri={card.coverUrl}
          width={72}
          height={72}
          borderRadius={22}
          placeholderColor={palette.placeholder}
        />
        <View style={styles.rankCardTitleGroup}>
          <ThemedText type="smallBold" style={{ color: palette.accent }}>
            榜单速览
          </ThemedText>
          <ThemedText>{card.title}</ThemedText>
          <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={2}>
            {card.intro}
          </ThemedText>
        </View>
      </View>

      <View style={styles.rankSongList}>
        {card.songs.map((song, index) => (
          <View key={`${card.id}-${song.id}`} style={styles.rankSongRow}>
            <ThemedText type="smallBold" style={{ color: palette.accent }}>
              {String(index + 1).padStart(2, '0')}
            </ThemedText>
            <View style={styles.rankSongInfo}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {song.title}
              </ThemedText>
              <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={1}>
                {song.artist}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

function BannerCard({
  banner,
  palette,
  textSecondary,
}: {
  banner: HomeBanner;
  palette: HomePalette;
  textSecondary: string;
}) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.bannerCard,
        {
          borderColor: palette.border,
          backgroundColor: palette.cardSurface,
        },
      ]}>
      <Artwork
        uri={banner.imageUrl}
        width="100%"
        height={152}
        borderRadius={24}
        placeholderColor={palette.placeholder}
      />
      <View style={styles.bannerMeta}>
        <ThemedText type="smallBold" style={{ color: palette.accent }} numberOfLines={1}>
          精选专题
        </ThemedText>
        <ThemedText numberOfLines={2}>{banner.title}</ThemedText>
        <ThemedText type="small" style={{ color: textSecondary }} numberOfLines={2}>
          {banner.subtitle}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyCard}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{description}</ThemedText>
    </ThemedView>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const palette = buildPalette(theme.background === '#000000');
  const safeAreaInsets = useSafeAreaInsets();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    homeData: null,
    initialLoading: true,
    refreshing: false,
    errorMessage: '',
  });

  async function refreshHome(mode: 'initial' | 'refresh' | 'reset' = 'initial') {
    const requestId = ++requestIdRef.current;

    startTransition(() => {
      setState((current) => ({
        ...current,
        initialLoading: !current.homeData || mode === 'reset',
        refreshing: Boolean(current.homeData) && mode !== 'reset',
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

      const message = formatError(error);
      startTransition(() => {
        setState((current) => ({
          homeData: current.homeData,
          initialLoading: false,
          refreshing: false,
          errorMessage: current.homeData ? `刷新失败，继续显示上次内容。${message}` : message,
        }));
      });
    }
  }

  async function resetAndReload() {
    startTransition(() => {
      setState((current) => ({
        ...current,
        initialLoading: true,
        refreshing: false,
        errorMessage: '',
      }));
    });

    await clearApiSession();
    await refreshHome('reset');
  }

  useEffect(() => {
    void refreshHome('initial');
  }, []);

  if (!state.homeData && state.initialLoading) {
    return (
      <ThemedView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={palette.accent} />
        <View style={styles.loadingTextGroup}>
          <ThemedText type="smallBold">正在准备首页内容</ThemedText>
          <ThemedText themeColor="textSecondary">设备注册、推荐歌单和榜单会在后台自动完成。</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!state.homeData) {
    return (
      <ThemedView style={styles.screen}>
        <View
          style={[
            styles.fallbackContainer,
            {
              paddingTop: safeAreaInsets.top + Spacing.four,
              paddingBottom: safeAreaInsets.bottom + BottomTabInset + Spacing.four,
              paddingLeft: safeAreaInsets.left + Spacing.four,
              paddingRight: safeAreaInsets.right + Spacing.four,
            },
          ]}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.fallbackCard,
              {
                borderColor: palette.border,
                backgroundColor: palette.cardSurface,
              },
            ]}>
            <ThemedText type="title" style={styles.fallbackTitle}>
              首页暂时没能拉起
            </ThemedText>
            <ThemedText themeColor="textSecondary">{state.errorMessage || '请稍后再试。'}</ThemedText>
            <View style={styles.fallbackActions}>
              <Pressable onPress={() => void refreshHome('initial')} style={styles.flexButton}>
                <View
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: palette.accent,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    重新加载
                  </ThemedText>
                </View>
              </Pressable>
              <Pressable onPress={() => void resetAndReload()} style={styles.flexButton}>
                <View
                  style={[
                    styles.secondaryButton,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.cardStrong,
                    },
                  ]}>
                  <ThemedText type="smallBold">重置 API</ThemedText>
                </View>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </ThemedView>
    );
  }

  const heroBanner = state.homeData.banners[0];
  const heroKeywords = state.homeData.hotKeywords.slice(0, 4);
  const sectionsNotice = state.errorMessage || state.homeData.issues[0] || '';

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void refreshHome('refresh')}
            tintColor={palette.accent}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeAreaInsets.top + Spacing.three,
            paddingBottom: safeAreaInsets.bottom + BottomTabInset + Spacing.four,
            paddingLeft: safeAreaInsets.left + Spacing.three,
            paddingRight: safeAreaInsets.right + Spacing.three,
          },
        ]}>
        <ThemedView
          type="backgroundElement"
          style={[
            styles.heroCard,
            {
              borderColor: palette.border,
              backgroundColor: palette.heroSurface,
            },
          ]}>
          <View style={[styles.heroOrbLarge, { backgroundColor: palette.accentSoft }]} />
          <View style={[styles.heroOrbSmall, { backgroundColor: palette.warmSoft }]} />
          {heroBanner?.imageUrl ? (
            <Image
              source={{ uri: heroBanner.imageUrl }}
              style={styles.heroArtwork}
              contentFit="cover"
              transition={220}
            />
          ) : null}

          <View style={styles.heroContent}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              MoeKoeMusic Mobile
            </ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              {heroBanner?.title || '今天想听点什么'}
            </ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              {heroBanner?.subtitle || '每日推荐、热搜趋势和酷狗榜单都已经准备好了。'}
            </ThemedText>

            <View style={styles.heroStats}>
              <View style={[styles.heroStatChip, { backgroundColor: palette.cardSurface }]}>
                <ThemedText type="smallBold">{state.homeData.dailySongs.length} 首</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  每日推荐
                </ThemedText>
              </View>
              <View style={[styles.heroStatChip, { backgroundColor: palette.cardSurface }]}>
                <ThemedText type="smallBold">{state.homeData.playlists.length} 张</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  推荐歌单
                </ThemedText>
              </View>
              <View style={[styles.heroStatChip, { backgroundColor: palette.cardSurface }]}>
                <ThemedText type="smallBold">{state.homeData.rankCards.length} 组</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  热门榜单
                </ThemedText>
              </View>
            </View>

            <View style={styles.heroKeywords}>
              {heroKeywords.map((item) => (
                <View
                  key={item.keyword}
                  style={[
                    styles.heroKeywordChip,
                    {
                      backgroundColor: palette.cardSurface,
                      borderColor: palette.border,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: palette.accent }}>
                    #{item.keyword}
                  </ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.heroFooter}>
              <Pressable onPress={() => void refreshHome('refresh')}>
                <View style={[styles.primaryButton, { backgroundColor: palette.accent }]}>
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    刷新首页
                  </ThemedText>
                </View>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                更新于 {formatUpdatedAt(state.homeData.updatedAt)}
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        {sectionsNotice ? (
          <ThemedView
            style={[
              styles.noticeCard,
              {
                backgroundColor: palette.warningSurface,
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: palette.warningText }}>
              {sectionsNotice}
            </ThemedText>
          </ThemedView>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            eyebrow="专题精选"
            title="轮播与活动"
            subtitle="移动端首屏优先展示可快速进入的推荐内容。"
          />
          {state.homeData.banners.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}>
              {state.homeData.banners.map((banner) => (
                <BannerCard
                  key={banner.id}
                  banner={banner}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))}
            </ScrollView>
          ) : (
            <EmptyState title="暂无轮播内容" description="稍后刷新后会自动补齐。" />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="搜索趋势"
            title="热搜话题"
            subtitle="把当前平台正在升温的关键字直接放到首页。"
          />
          {state.homeData.hotKeywords.length ? (
            <View style={styles.keywordGrid}>
              {state.homeData.hotKeywords.map((item) => (
                <KeywordChip
                  key={item.keyword}
                  keyword={item}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))}
            </View>
          ) : (
            <EmptyState title="暂无热搜内容" description="接口恢复后会自动展示趋势词。" />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="每日推荐"
            title="今天值得先点开的歌"
            subtitle="优先保留短信息密度高的移动端听歌入口。"
          />
          <View style={styles.songList}>
            {state.homeData.dailySongs.length ? (
              state.homeData.dailySongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))
            ) : (
              <EmptyState title="暂无每日推荐" description="推荐曲目准备好后会直接出现在这里。" />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="歌单广场"
            title="推荐歌单"
            subtitle="沿用桌面端的推荐歌单主轴，但改成更适合单手滑动的双列结构。"
          />
          {state.homeData.playlists.length ? (
            <View style={styles.playlistGrid}>
              {state.homeData.playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))}
            </View>
          ) : (
            <EmptyState title="暂无推荐歌单" description="歌单返回后会自动渲染到这里。" />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="榜单速览"
            title="现在大家在听什么"
            subtitle="只抓最热的前三组榜单，并在卡片里直接展开前三首。"
          />
          {state.homeData.rankCards.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}>
              {state.homeData.rankCards.map((card) => (
                <RankCard
                  key={card.id}
                  card={card}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))}
            </ScrollView>
          ) : (
            <EmptyState title="暂无榜单内容" description="榜单歌曲返回后会自动展示。" />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="新歌速递"
            title="最近更新"
            subtitle="把新歌和推荐理由放在首页底部，适合继续下滑浏览。"
          />
          <View style={styles.songList}>
            {state.homeData.newSongs.length ? (
              state.homeData.newSongs.map((song) => (
                <SongRow
                  key={`new-${song.id}`}
                  song={song}
                  palette={palette}
                  textSecondary={theme.textSecondary}
                />
              ))
            ) : (
              <EmptyState title="暂无新歌内容" description="新歌列表返回后会自动出现。" />
            )}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.five,
  },
  loadingTextGroup: {
    marginTop: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fallbackCard: {
    borderWidth: 1,
    borderRadius: 32,
    padding: Spacing.five,
    gap: Spacing.three,
  },
  fallbackTitle: {
    fontSize: 36,
    lineHeight: 40,
  },
  fallbackActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 34,
    minHeight: 340,
    padding: Spacing.five,
  },
  heroOrbLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    top: -70,
    right: -40,
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    bottom: -50,
    left: -30,
  },
  heroArtwork: {
    position: 'absolute',
    right: -8,
    top: 22,
    width: 176,
    height: 176,
    borderRadius: 28,
    opacity: 0.36,
  },
  heroContent: {
    gap: Spacing.three,
  },
  heroTitle: {
    maxWidth: 470,
    fontSize: 42,
    lineHeight: 46,
  },
  heroSubtitle: {
    maxWidth: 500,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  heroStatChip: {
    minWidth: 104,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  heroKeywords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  heroKeywordChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  heroFooter: {
    marginTop: Spacing.one,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  noticeCard: {
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  sectionHeader: {
    gap: Spacing.one,
  },
  sectionTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  horizontalList: {
    gap: Spacing.three,
    paddingRight: Spacing.one,
  },
  bannerCard: {
    width: 292,
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  bannerMeta: {
    gap: Spacing.one,
  },
  keywordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  keywordChip: {
    width: '48.6%',
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  songList: {
    gap: Spacing.two,
  },
  songRow: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  songInfo: {
    flex: 1,
    gap: 2,
  },
  songNoteBadge: {
    maxWidth: '44%',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  playlistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  playlistCard: {
    width: '47.9%',
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  playlistMeta: {
    gap: Spacing.one,
  },
  playlistFooter: {
    gap: Spacing.one,
  },
  playlistTag: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  rankCard: {
    width: 292,
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  rankCardTop: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  rankCardTitleGroup: {
    flex: 1,
    gap: 2,
  },
  rankSongList: {
    gap: Spacing.two,
  },
  rankSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rankSongInfo: {
    flex: 1,
    gap: 2,
  },
  emptyCard: {
    borderRadius: 24,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
});
