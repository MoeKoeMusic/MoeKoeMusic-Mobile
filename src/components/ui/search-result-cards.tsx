import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import type {
  SearchAlbum,
  SearchArtist,
  SearchMv,
  SearchPlaylist,
} from '@/features/search/search-api';
import { usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';

type CardProps<T> = {
  item: T;
  /** 固定宽度（横向滚动时传入）；网格里不传则 flex 撑满格子。 */
  width?: number;
  onPress: () => void;
};

function cardFrame(width?: number) {
  return width ? { width } : { flex: 1 };
}

/** 歌手卡片：参考桌面端 ArtistGrid —— 头像 + 名字 + 专辑/单曲数。 */
export const ArtistCard = memo(function ArtistCard({
  item,
  width,
  onPress,
}: CardProps<SearchArtist>) {
  const palette = usePalette();
  const counts = [
    item.albumCount ? `专辑 ${item.albumCount}` : '',
    item.songCount ? `单曲 ${item.songCount}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <YStack
      {...cardFrame(width)}
      alignItems="center"
      gap={8}
      paddingVertical={10}
      borderRadius={16}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.97 }}
      onPress={onPress}>
      <Artwork uri={item.avatarUrl} size={width ? width - 20 : 84} circle />
      <YStack alignItems="center" gap={2} paddingHorizontal={4}>
        <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
          {item.name}
        </Text>
        {counts ? (
          <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
            {counts}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
});

/** 专辑卡片：参考桌面端 AlbumGrid —— 方形封面 + 专辑名 + 歌手/年份。 */
export const AlbumCard = memo(function AlbumCard({
  item,
  width,
  onPress,
}: CardProps<SearchAlbum>) {
  const palette = usePalette();
  const meta = [item.artist, item.publishDate].filter(Boolean).join(' · ');

  return (
    <YStack
      {...cardFrame(width)}
      gap={7}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <Artwork uri={item.coverUrl} radius={16} />
      <YStack gap={2} paddingHorizontal={2}>
        <Text color={palette.text} fontSize={12.5} fontWeight="600" lineHeight={17} numberOfLines={2}>
          {item.name}
        </Text>
        <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
          {meta}
        </Text>
      </YStack>
    </YStack>
  );
});

/** 歌单卡片：参考桌面端 PlaylistGrid —— 封面（播放量角标）+ 歌单名 + 创建者。 */
export const PlaylistCard = memo(function PlaylistCard({
  item,
  width,
  onPress,
}: CardProps<SearchPlaylist>) {
  const palette = usePalette();

  return (
    <YStack
      {...cardFrame(width)}
      gap={7}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <View>
        <Artwork uri={item.coverUrl} radius={16} />
        {item.playCountText ? (
          <XStack
            position="absolute"
            left={8}
            bottom={8}
            alignItems="center"
            gap={3}
            backgroundColor="rgba(12, 12, 18, 0.55)"
            paddingHorizontal={7}
            paddingVertical={3}
            borderRadius={999}>
            <Ionicons name="play" size={9} color="#FFFFFF" />
            <Text color="#FFFFFF" fontSize={10.5} fontWeight="600">
              {item.playCountText}
            </Text>
          </XStack>
        ) : null}
      </View>
      <YStack gap={2} paddingHorizontal={2}>
        <Text color={palette.text} fontSize={12.5} fontWeight="600" lineHeight={17} numberOfLines={2}>
          {item.name}
        </Text>
        <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
          {[item.creator, item.songCount ? `${item.songCount} 首` : ''].filter(Boolean).join(' · ')}
        </Text>
      </YStack>
    </YStack>
  );
});

/** MV 卡片：参考桌面端 MvGrid —— 16:9 封面 + 时长角标 + 标题 + 歌手。 */
export const MvCard = memo(function MvCard({ item, width, onPress }: CardProps<SearchMv>) {
  const palette = usePalette();

  return (
    <YStack
      {...cardFrame(width)}
      gap={7}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <View style={styles.mvCover}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.cardAlt }]} />
        )}
        <View style={styles.mvPlayBadge}>
          <Ionicons name="play" size={14} color="#FFFFFF" />
        </View>
        {item.durationMs > 0 ? (
          <View style={styles.mvDuration}>
            <Text color="#FFFFFF" fontSize={10} fontWeight="600">
              {formatClock(item.durationMs)}
            </Text>
          </View>
        ) : null}
      </View>
      <YStack gap={2} paddingHorizontal={2}>
        <Text color={palette.text} fontSize={12.5} fontWeight="600" lineHeight={17} numberOfLines={2}>
          {item.name}
        </Text>
        <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
          {item.singer}
        </Text>
      </YStack>
    </YStack>
  );
});

const styles = StyleSheet.create({
  mvCover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mvPlayBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mvDuration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
