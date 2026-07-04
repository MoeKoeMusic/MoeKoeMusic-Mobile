import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { startTransition, useCallback, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { SectionHeader } from '@/components/ui/section-header';
import {
  fetchUserPlaylists,
  fetchUserProfile,
  isLoggedIn,
  type UserPlaylistItem,
  type UserProfile,
} from '@/features/account/user-api';
import { MaxContentWidth } from '@/constants/theme';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { bootstrapMobileApi, clearApiSession } from '@/lib/kugou-api';

type ScreenState = {
  checking: boolean;
  refreshing: boolean;
  loggedIn: boolean;
  profile: UserProfile | null;
  playlists: UserPlaylistItem[];
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
  item: UserPlaylistItem;
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
    playlists: [],
    error: '',
  });

  const version = Constants.expoConfig?.version ?? '';

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
        if (requestId !== requestIdRef.current) return;
        startTransition(() => {
          setState({
            checking: false,
            refreshing: false,
            loggedIn: false,
            profile: null,
            playlists: [],
            error: '',
          });
        });
        return;
      }

      const [profileResult, playlistResult] = await Promise.allSettled([
        fetchUserProfile(),
        fetchUserPlaylists(),
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
          playlists: playlistResult.status === 'fulfilled' ? playlistResult.value : [],
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

  function confirmLogout() {
    Alert.alert('退出登录', '将清除本机保存的登录信息', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearApiSession();
            await load('initial');
          })();
        },
      },
    ]);
  }

  const createdPlaylists = state.playlists.filter((item) => item.isMine);
  const collectedPlaylists = state.playlists.filter((item) => !item.isMine);

  function openPlaylist(item: UserPlaylistItem) {
    router.push({
      pathname: '/playlist/[id]',
      params: { id: item.gid, name: item.name, cover: item.coverUrl ?? '' },
    });
  }

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
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: dockInset },
        ]}>
        <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
          我的
        </Text>

        {state.checking ? (
          <YStack alignItems="center" paddingVertical={80}>
            <Spinner size="large" color={palette.accent} />
          </YStack>
        ) : state.loggedIn && state.profile ? (
          <>
            <YStack
              borderRadius={24}
              overflow="hidden"
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              backgroundColor={palette.card}>
              <LinearGradient
                colors={[palette.accentSoft, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <YStack padding={20} gap={16} backgroundColor="transparent">
                <XStack alignItems="center" gap={16}>
                  {state.profile.avatarUrl ? (
                    <Image source={{ uri: state.profile.avatarUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <Artwork uri={null} size={64} circle />
                  )}
                  <YStack flex={1} gap={5}>
                    <XStack alignItems="center" gap={8}>
                      <Text color={palette.text} fontSize={19} fontWeight="800" numberOfLines={1}>
                        {state.profile.nickname}
                      </Text>
                      {state.profile.isVip ? (
                        <Text
                          color={palette.vip}
                          backgroundColor={palette.vipSoft}
                          fontSize={10}
                          fontWeight="800"
                          paddingHorizontal={7}
                          paddingVertical={2.5}
                          borderRadius={7}
                          overflow="hidden">
                          {state.profile.vipLabel}
                        </Text>
                      ) : null}
                    </XStack>
                    <Text color={palette.textTertiary} fontSize={12}>
                      ID {state.profile.userid}
                    </Text>
                  </YStack>
                </XStack>

                <XStack gap={10}>
                  {[
                    { label: '关注', value: String(state.profile.follows) },
                    { label: '粉丝', value: String(state.profile.fans) },
                    { label: '听歌时长', value: formatListenTime(state.profile.listenMinutes) },
                  ].map((stat) => (
                    <YStack
                      key={stat.label}
                      flex={1}
                      alignItems="center"
                      gap={3}
                      paddingVertical={12}
                      borderRadius={16}
                      backgroundColor={palette.cardAlt}>
                      <Text color={palette.text} fontSize={15} fontWeight="700">
                        {stat.value}
                      </Text>
                      <Text color={palette.textTertiary} fontSize={11.5}>
                        {stat.label}
                      </Text>
                    </YStack>
                  ))}
                </XStack>
              </YStack>
            </YStack>

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

            {createdPlaylists.length ? (
              <YStack gap={10}>
                <SectionHeader title="我创建的歌单" />
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
              </YStack>
            ) : null}

            {collectedPlaylists.length ? (
              <YStack gap={10}>
                <SectionHeader title="收藏的歌单" />
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
              </YStack>
            ) : null}

            <XStack
              alignItems="center"
              justifyContent="center"
              height={48}
              borderRadius={16}
              backgroundColor={palette.card}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              transition="quickest"
              pressStyle={{ opacity: 0.7 }}
              onPress={confirmLogout}>
              <Text color={palette.danger} fontSize={14.5} fontWeight="600">
                退出登录
              </Text>
            </XStack>
          </>
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

        {version ? (
          <Text color={palette.textTertiary} fontSize={11} textAlign="center" paddingTop={6}>
            MoeKoe Music v{version}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: 16,
    gap: 18,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
  },
});
