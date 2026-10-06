import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { useAnimationsEnabled } from '@/features/settings/store';
import { usePalette } from '@/hooks/use-palette';

type ArtworkProps = {
  uri: string | null | undefined;
  /** 固定边长；不传则铺满父容器（正方形）。 */
  size?: number;
  radius?: number;
  circle?: boolean;
};

export function Artwork({ uri, size, radius = 14, circle = false }: ArtworkProps) {
  const palette = usePalette();
  const animationsEnabled = useAnimationsEnabled();
  // 加载失败时先强制重新请求一次（CDN 偶发失败在弱网下不少见），
  // 再失败就回退到占位渐变，避免一直露着灰底。
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // uri 变化（切歌）时复位重试状态
  const [lastUri, setLastUri] = useState(uri);
  if (uri !== lastUri) {
    setLastUri(uri);
    setAttempt(0);
    setFailed(false);
  }

  const frameStyle = size
    ? { width: size, height: size, borderRadius: circle ? size / 2 : radius }
    : { width: '100%' as const, aspectRatio: 1, borderRadius: radius };

  if (!uri || failed) {
    const iconSize = size ? Math.max(16, Math.round(size * 0.38)) : 34;
    return (
      <LinearGradient
        colors={[palette.placeholderStart, palette.placeholderEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.placeholder, frameStyle]}>
        <Ionicons name="musical-notes" size={iconSize} color={palette.textTertiary} />
      </LinearGradient>
    );
  }

  const source =
    attempt > 0
      ? { uri: `${uri}${uri.includes('?') ? '&' : '?'}retry=${attempt}` }
      : { uri };

  return (
    <View style={[styles.frame, frameStyle, { backgroundColor: palette.cardAlt }]}>
      <Image
        source={source}
        recyclingKey={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={animationsEnabled ? 200 : 0}
        onError={() => {
          if (attempt < 1) {
            setAttempt(attempt + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
