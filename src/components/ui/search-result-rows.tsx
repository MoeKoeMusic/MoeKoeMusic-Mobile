import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import type { SearchAlbum, SearchArtist, SearchPlaylist } from '@/features/search/search-api';
import { usePalette } from '@/hooks/use-palette';

type RowProps<T> = {
  item: T;
  onPress: () => void;
};

function metaLine(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

export const PlaylistResultRow = memo(function PlaylistResultRow({
  item,
  onPress,
}: RowProps<SearchPlaylist>) {
  const palette = usePalette();
  return (
    <RowShell onPress={onPress} radius={12}>
      <Artwork uri={item.coverUrl} size={54} radius={12} />
      <RowText
        title={item.name}
        subtitle={metaLine([item.creator, item.songCount ? `${item.songCount} 首` : '', item.playCountText && `${item.playCountText} 播放`])}
      />
      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
    </RowShell>
  );
});

export const AlbumResultRow = memo(function AlbumResultRow({
  item,
  onPress,
}: RowProps<SearchAlbum>) {
  const palette = usePalette();
  return (
    <RowShell onPress={onPress} radius={12}>
      <Artwork uri={item.coverUrl} size={54} radius={12} />
      <RowText
        title={item.name}
        subtitle={metaLine([item.artist, item.songCount ? `${item.songCount} 首` : '', item.publishDate])}
      />
      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
    </RowShell>
  );
});

export const ArtistResultRow = memo(function ArtistResultRow({
  item,
  onPress,
}: RowProps<SearchArtist>) {
  const palette = usePalette();
  return (
    <RowShell onPress={onPress} radius={12}>
      <Artwork uri={item.avatarUrl} size={54} circle />
      <RowText
        title={item.name}
        subtitle={metaLine([item.albumCount ? `专辑 ${item.albumCount}` : '', item.songCount ? `单曲 ${item.songCount}` : ''])}
      />
      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
    </RowShell>
  );
});

function RowShell({
  children,
  onPress,
  radius,
}: {
  children: React.ReactNode;
  onPress: () => void;
  radius: number;
}) {
  const palette = usePalette();
  return (
    <XStack
      alignItems="center"
      gap={12}
      paddingVertical={8}
      paddingHorizontal={10}
      borderRadius={radius}
      transition="quickest"
      pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
      onPress={onPress}>
      {children}
    </XStack>
  );
}

function RowText({ title, subtitle }: { title: string; subtitle: string }) {
  const palette = usePalette();
  return (
    <YStack flex={1} gap={3} justifyContent="center">
      <Text color={palette.text} fontSize={15} fontWeight="600" numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text color={palette.textTertiary} fontSize={12.5} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}
