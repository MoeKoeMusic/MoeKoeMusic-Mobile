import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { showToast } from '@/components/ui/toast';
import { CreatePlaylistSheet } from '@/components/ui/track-actions-sheet';
import {
  fetchUserProfile,
  isLoggedIn,
  type UserProfile,
} from '@/features/account/user-api';
import { signInDailyVip, upgradeDailyVip } from '@/features/account/vip-api';
import { libraryActions, useLibrary, type LibraryPlaylist } from '@/features/library/store';
import { MaxContentWidth } from '@/constants/theme';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { bootstrapMobileApi } from '@/lib/kugou-api';

type ScreenState = {
  checking: boolean;
  refreshing: boolean;
  loggedIn: boolean;
  profile: UserProfile | null;
  error: string;
};

function formatListenTime(minutes: number): string {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)} 小时`;
  }

  return minutes > 0 ? `${minutes} 分钟` : '—';
}

function PlaylistRow({
  item,
  onPress,
}: {
  item: LibraryPlaylist;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      gap={12}
      paddingVertical={9}
      paddingHorizontal={10}
      borderRadius={14}
      transition="quickest"
      pressStyle={{ opacity: 0.65, backgroundColor: palette.cardAlt }}
      onPress={onPress}>
      <Artwork uri={item.coverUrl} size={46} radius={12} />
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={14.5} fontWeight="600" numberOfLines={1}>
          {item.name}
        </Text>
        <Text color={palette.textTertiary} fontSize={12}>
          {item.count} 首
        </Text>
      </YStack>
      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
    </XStack>
  );
}

/** 个人中心顶部"我喜欢/我的云盘"入口卡片。 */
function QuickEntryCard({
  icon,
  gradient,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      flex={1}
      alignItems="center"
      gap={11}
      padding={12}
      borderRadius={18}
      backgroundColor={palette.card}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={palette.border}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <XStack
        width={42}
        height={42}
        borderRadius={13}
        overflow="hidden"
        alignItems="center"
        justifyContent="center">
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </XStack>
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={14.5} fontWeight="700" numberOfLines={1}>
          {title}
        </Text>
        <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
          {subtitle}
        </Text>
      </YStack>
    </XStack>
  );
}

/** 可点击展开/收起的歌单分组标题。 */
function CollapsibleSectionHeader({
  title,
  count,
  open,
  onToggle,
  actionLabel,
  onAction,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      gap={8}
      transition="quickest"
      pressStyle={{ opacity: 0.65 }}
      onPress={onToggle}>
      <Text color={palette.text} fontSize={18} fontWeight="700" letterSpacing={0.2}>
        {title}
      </Text>
      <Text flex={1} color={palette.textTertiary} fontSize={12.5}>
        {count > 0 ? `${count} 个` : ''}
      </Text>
      {actionLabel && onAction ? (
        <Text
          color={palette.accent}
          fontSize={13.5}
          fontWeight="600"
          paddingVertical={4}
          paddingHorizontal={4}
          pressStyle={{ opacity: 0.6 }}
          onPress={onAction}
          suppressHighlighting>
          {actionLabel}
        </Text>
      ) : null}
      <XStack
        width={24}
        height={24}
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        backgroundColor={palette.cardAlt}>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={palette.textSecondary}
        />
      </XStack>
    </XStack>
  );
}

export default function MeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    checking: true,
    refreshing: false,
    loggedIn: false,
    profile: null,
    error: '',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // 创建的歌单默认展开，收藏的歌单默认收起
  const [createdOpen, setCreatedOpen] = useState(true);
  const [collectedOpen, setCollectedOpen] = useState(false);
  const library = useLibrary();

  const handleUpgrade = useCallback(async () => {
    setSigningIn(true);
    try {
      const result = await upgradeDailyVip();
      showToast(result.message);
      if (!result.alreadyDone) {
        void load('refresh');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '升级失败，请稍后重试');
    } finally {
      setSigningIn(false);
    }
    // load 在下方定义，用 ref 稳定引用即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = useCallback(async () => {
    if (signingIn) {
      return;
    }
    setSigningIn(true);
    try {
      const result = await signInDailyVip();
      if (!result.alreadyDone) {
        void load('refresh');
      }
      if (result.canUpgrade) {
        // 与桌面端一致：签到完成后询问是否升级概念版 VIP（更高音质），一天仅限一次
        Alert.alert(result.message, '是否继续升级至概念版 VIP，享受更高音质？', [
          { text: '暂不', style: 'cancel' },
          { text: '升级', onPress: () => void handleUpgrade() },
        ]);
      } else {
        showToast(result.message);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '签到失败，请稍后重试');
    } finally {
      setSigningIn(false);
    }
    // load 在下方定义，用 ref 稳定引用即可；此处依赖 signingIn 足够。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signingIn, handleUpgrade]);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    const requestId = ++requestIdRef.current;

    startTransition(() => {
      setState((current) => ({
        ...current,
        checking: mode === 'initial' && !current.profile,
        refreshing: mode === 'refresh',
        error: '',
      }));
    });

    try {
      await bootstrapMobileApi();

      if (!isLoggedIn()) {
        libraryActions.reset();
        if (requestId !== requestIdRef.current) return;
        startTransition(() => {
          setState({
            checking: false,
            refreshing: false,
            loggedIn: false,
            profile: null,
            error: '',
          });
        });
        return;
      }

      const [profileResult] = await Promise.allSettled([
        fetchUserProfile(),
        libraryActions.refresh(),
      ]);

      if (requestId !== requestIdRef.current) return;

      if (profileResult.status === 'rejected') {
        throw profileResult.reason;
      }

      startTransition(() => {
        setState({
          checking: false,
          refreshing: false,
          loggedIn: true,
          profile: profileResult.value,
          error: '',
        });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      startTransition(() => {
        setState((current) => ({
          ...current,
          checking: false,
          refreshing: false,
          error: error instanceof Error ? error.message : '加载失败',
        }));
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load])
  );

  // "我喜欢"独立成顶部卡片入口，不再混在创建的歌单列表里
  const likePlaylist = library.playlists.find((item) => item.isLike) ?? null;
  const createdPlaylists = library.playlists.filter((item) => item.isMine && !item.isLike);
  const collectedPlaylists = library.playlists.filter((item) => !item.isMine);

  function openPlaylist(item: LibraryPlaylist) {
    router.push({
      pathname: '/playlist/[id]',
      params: { id: item.gid, name: item.name, cover: item.coverUrl ?? '' },
    });
  }

  const profile = state.loggedIn && state.profile ? state.profile : null;
  const bannerUrl = profile?.backgroundUrl ?? null;
  const [bannerFailed, setBannerFailed] = useState(false);

  useEffect(() => {
    setBannerFailed(false);
  }, [bannerUrl]);

  return (
    <View flex={1} backgroundColor={palette.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressViewOffset={insets.top}
          />
        }
        contentContainerStyle={{ paddingBottom: dockInset }}>
        {profile ? (
          <>
            {/* 沉浸式背景头图，穿透状态栏 */}
            <View height={insets.top + 148} backgroundColor={palette.cardAlt}>
              {bannerUrl && !bannerFailed ? (
                <>
                  <Image
                    source={{ uri: bannerUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={280}
                    onError={() => setBannerFailed(true)}
                  />
                  <LinearGradient
                    colors={['rgba(8, 8, 14, 0.22)', 'transparent', 'rgba(8, 8, 14, 0.28)']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              ) : (
                <LinearGradient
                  colors={[palette.gradientStart, palette.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </View>

            <YStack
              alignSelf="center"
              width="100%"
              maxWidth={MaxContentWidth}
              paddingHorizontal={16}
              gap={18}>
              <YStack>
                <XStack marginTop={-34} alignItems="flex-end" gap={12}>
                  <View padding={3} borderRadius={999} backgroundColor={palette.background}>
                    {profile.avatarUrl ? (
                      <Image
                        source={{ uri: profile.avatarUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <Artwork uri={null} size={68} circle />
                    )}
                  </View>
                  <XStack flex={1} alignItems="center" gap={8} paddingBottom={8}>
                    <Text
                      flexShrink={1}
                      color={palette.text}
                      fontSize={20}
                      fontWeight="800"
                      numberOfLines={1}>
                      {profile.nickname}
                    </Text>
                    {profile.isVip ? (
                      <Text
                        color={palette.vip}
                        backgroundColor={palette.vipSoft}
                        fontSize={10}
                        fontWeight="800"
                        paddingHorizontal={7}
                        paddingVertical={2.5}
                        borderRadius={7}
                        overflow="hidden">
                        {profile.vipLabel}
                      </Text>
                    ) : null}
                  </XStack>
                </XStack>

                <YStack marginTop={8} gap={4}>
                  <Text color={palette.textTertiary} fontSize={12}>
                    ID {profile.userid}
                  </Text>
                  {profile.signature ? (
                    <Text
                      color={palette.textSecondary}
                      fontSize={12.5}
                      lineHeight={18}
                      numberOfLines={2}>
                      {profile.signature}
                    </Text>
                  ) : null}
                </YStack>

                <XStack gap={10} marginTop={14}>
                  {[
                    { label: '关注', value: String(profile.follows) },
                    { label: '粉丝', value: String(profile.fans) },
                    { label: '听歌时长', value: formatListenTime(profile.listenMinutes) },
                  ].map((stat) => (
                    <YStack
                      key={stat.label}
                      flex={1}
                      alignItems="center"
                      gap={3}
                      paddingVertical={12}
                      borderRadius={16}
                      backgroundColor={palette.card}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}>
                      <Text color={palette.text} fontSize={15} fontWeight="700">
                        {stat.value}
                      </Text>
                      <Text color={palette.textTertiary} fontSize={11.5}>
                        {stat.label}
                      </Text>
                    </YStack>
                  ))}
                </XStack>

                <XStack
                  marginTop={12}
                  alignItems="center"
                  justifyContent="center"
                  gap={7}
                  height={44}
                  borderRadius={16}
                  backgroundColor={palette.vipSoft}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={palette.vip}
                  opacity={signingIn ? 0.6 : 1}
                  transition="quickest"
                  pressStyle={{ opacity: 0.75, scale: 0.99 }}
                  onPress={() => void handleSignIn()}>
                  {signingIn ? (
                    <Spinner size="small" color={palette.vip} />
                  ) : (
                    <Ionicons name="gift" size={16} color={palette.vip} />
                  )}
                  <Text color={palette.vip} fontSize={14} fontWeight="700">
                    {signingIn ? '签到中…' : '签到领取 VIP'}
                  </Text>
                </XStack>
              </YStack>

              <XStack gap={10}>
                <QuickEntryCard
                  icon="heart"
                  gradient={[palette.gradientStart, palette.gradientEnd]}
                  title="我喜欢"
                  subtitle={likePlaylist ? `${likePlaylist.count} 首` : '收藏喜欢的歌曲'}
                  onPress={() => {
                    if (likePlaylist) {
                      openPlaylist(likePlaylist);
                    } else {
                      showToast('还没有"我喜欢"歌单');
                    }
                  }}
                />
                <QuickEntryCard
                  icon="cloud"
                  gradient={['#5EA8FF', '#3E7BFA']}
                  title="我的云盘"
                  subtitle="上传的音乐"
                  onPress={() => router.push('/cloud')}
                />
              </XStack>

              {state.error ? (
                <XStack
                  alignItems="center"
                  gap={8}
                  paddingHorizontal={14}
                  paddingVertical={10}
                  borderRadius={14}
                  backgroundColor={palette.dangerSoft}>
                  <Ionicons name="alert-circle" size={15} color={palette.danger} />
                  <Text flex={1} color={palette.danger} fontSize={12.5}>
                    {state.error}
                  </Text>
                </XStack>
              ) : null}

              <YStack gap={10}>
                <CollapsibleSectionHeader
                  title="我创建的歌单"
                  count={createdPlaylists.length}
                  open={createdOpen}
                  onToggle={() => setCreatedOpen((open) => !open)}
                  actionLabel="新建"
                  onAction={() => setCreateOpen(true)}
                />
                {createdOpen ? (
                  createdPlaylists.length ? (
                    <YStack
                      backgroundColor={palette.card}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      paddingVertical={6}
                      paddingHorizontal={4}>
                      {createdPlaylists.map((item) => (
                        <PlaylistRow key={item.gid} item={item} onPress={() => openPlaylist(item)} />
                      ))}
                    </YStack>
                  ) : (
                    <YStack
                      alignItems="center"
                      paddingVertical={22}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      backgroundColor={palette.card}>
                      <Text color={palette.textTertiary} fontSize={12.5}>
                        还没有自己的歌单，点右上角&quot;新建&quot;
                      </Text>
                    </YStack>
                  )
                ) : null}
              </YStack>

              {collectedPlaylists.length ? (
                <YStack gap={10}>
                  <CollapsibleSectionHeader
                    title="收藏的歌单"
                    count={collectedPlaylists.length}
                    open={collectedOpen}
                    onToggle={() => setCollectedOpen((open) => !open)}
                  />
                  {collectedOpen ? (
                    <YStack
                      backgroundColor={palette.card}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      paddingVertical={6}
                      paddingHorizontal={4}>
                      {collectedPlaylists.map((item) => (
                        <PlaylistRow key={item.gid} item={item} onPress={() => openPlaylist(item)} />
                      ))}
                    </YStack>
                  ) : null}
                </YStack>
              ) : null}
            </YStack>
          </>
        ) : (
          <YStack
            alignSelf="center"
            width="100%"
            maxWidth={MaxContentWidth}
            paddingHorizontal={16}
            paddingTop={insets.top + 14}
            gap={18}>
            <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
              我的
            </Text>

            {state.checking ? (
              <YStack alignItems="center" paddingVertical={80}>
                <Spinner size="large" color={palette.accent} />
              </YStack>
            ) : (
              <YStack
                borderRadius={26}
                overflow="hidden"
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}
                backgroundColor={palette.card}>
                <LinearGradient
                  colors={[palette.accentSoft, 'transparent']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <YStack alignItems="center" paddingVertical={38} paddingHorizontal={26} gap={18}>
                  <Image
                    source={require('@/assets/images/icon.png')}
                    style={styles.heroIcon}
                    contentFit="cover"
                  />
                  <YStack alignItems="center" gap={6}>
                    <Text color={palette.text} fontSize={19} fontWeight="800">
                      登录酷狗账号
                    </Text>
                    <Text color={palette.textTertiary} fontSize={13} textAlign="center" lineHeight={19}>
                      同步你的歌单与收藏，获得完整的听歌体验
                    </Text>
                  </YStack>
                  <XStack
                    height={46}
                    paddingHorizontal={34}
                    borderRadius={23}
                    overflow="hidden"
                    alignItems="center"
                    justifyContent="center"
                    transition="quickest"
                    pressStyle={{ scale: 0.97, opacity: 0.9 }}
                    onPress={() => router.push('/login')}>
                    <LinearGradient
                      colors={[palette.gradientStart, palette.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text color="#FFFFFF" fontSize={14.5} fontWeight="700">
                      立即登录
                    </Text>
                  </XStack>
                  {state.error ? (
                    <Text color={palette.danger} fontSize={12}>
                      {state.error}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
            )}

          </YStack>
        )}
      </ScrollView>

      <XStack
        position="absolute"
        top={insets.top + 8}
        right={16}
        width={38}
        height={38}
        borderRadius={19}
        alignItems="center"
        justifyContent="center"
        backgroundColor={palette.barSurface}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: 4 }}
        shadowOpacity={0.12}
        shadowRadius={10}
        elevation={4}
        transition="quickest"
        pressStyle={{ opacity: 0.7, scale: 0.96 }}
        onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={19} color={palette.text} />
      </XStack>

      <CreatePlaylistSheet open={createOpen} onOpenChange={setCreateOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
  },
});
