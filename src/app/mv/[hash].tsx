import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { fetchMvUrl } from '@/features/mv/mv-api';
import { playerActions } from '@/features/player/store';

export default function MvScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ hash: string; title?: string }>();
  const hash = typeof params.hash === 'string' ? params.hash : '';
  const title = typeof params.title === 'string' && params.title ? params.title : '视频播放';

  const [result, setResult] = useState<{
    hash: string;
    videoUrl: string | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    // 打开 MV 时暂停后台音频，避免声音叠加。
    playerActions.pause();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!hash) {
      return;
    }

    fetchMvUrl(hash)
      .then((url) => {
        if (cancelled) {
          return;
        }
        if (url) {
          setResult({ hash, videoUrl: url, error: '' });
        } else {
          setResult({ hash, videoUrl: null, error: '获取视频播放地址失败' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ hash, videoUrl: null, error: '加载视频失败，请稍后重试' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hash]);

  const currentResult = result?.hash === hash ? result : null;
  const videoUrl = currentResult?.videoUrl ?? null;
  const loading = Boolean(hash) && !currentResult;
  const error = hash ? (currentResult?.error ?? '') : '缺少视频参数';

  const player = useVideoPlayer(videoUrl, (instance) => {
    instance.play();
  });

  return (
    <View flex={1} backgroundColor="#000000">
      <StatusBar barStyle="light-content" />

      <XStack
        position="absolute"
        top={insets.top + 8}
        left={12}
        right={12}
        zIndex={10}
        alignItems="center"
        gap={10}>
        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor="rgba(0,0,0,0.45)"
          pressStyle={{ opacity: 0.6, scale: 0.94 }}
          onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </XStack>
        <Text flex={1} color="#FFFFFF" fontSize={16} fontWeight="600" numberOfLines={1}>
          {title}
        </Text>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color="#FFFFFF" />
        </YStack>
      ) : error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={32}>
          <Ionicons name="cloud-offline-outline" size={40} color="rgba(255,255,255,0.7)" />
          <Text color="rgba(255,255,255,0.7)" fontSize={14} textAlign="center">
            {error}
          </Text>
        </YStack>
      ) : videoUrl ? (
        <VideoView
          style={styles.video}
          player={player}
          allowsPictureInPicture
          contentFit="contain"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    flex: 1,
    width: '100%',
  },
});
