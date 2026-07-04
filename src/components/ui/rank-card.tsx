import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

type RankCardProps = {
  title: string;
  coverUrl: string | null;
  songs: PlayerTrack[];
  activeHash?: string;
  onPressSong: (index: number) => void;
  onPlayAll: () => void;
};

export const RankCard = memo(function RankCard({
  title,
  coverUrl,
  songs,
  activeHash,
  onPressSong,
  onPlayAll,
}: RankCardProps) {
  const palette = usePalette();

  return (
    <YStack
      width={286}
      backgroundColor={palette.card}
      borderWidth={1}
      borderColor={palette.border}
      borderRadius={22}
      padding="$3"
      gap={10}>
      <XStack alignItems="center" gap={12}>
        <Artwork uri={coverUrl} size={46} radius={13} />
        <Text flex={1} color={palette.text} fontSize={16} fontWeight="700" numberOfLines={1}>
          {title}
        </Text>
        <XStack
          width={34}
          height={34}
          borderRadius={17}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.accentSoft}
          transition="quickest"
          pressStyle={{ opacity: 0.6, scale: 0.92 }}
          onPress={onPlayAll}>
          <Ionicons name="play" size={16} color={palette.accent} style={{ marginLeft: 2 }} />
        </XStack>
      </XStack>

      <YStack gap={2}>
        {songs.map((song, index) => {
          const active = Boolean(activeHash && song.hash === activeHash);
          return (
            <XStack
              key={song.hash || `${title}-${index}`}
              alignItems="center"
              gap={10}
              paddingVertical={7}
              paddingHorizontal={6}
              borderRadius={12}
              backgroundColor={active ? palette.accentSoft : 'transparent'}
              transition="quickest"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => onPressSong(index)}>
              <Text
                width={18}
                color={index < 3 ? palette.accent : palette.textTertiary}
                fontSize={14}
                fontWeight="800"
                fontStyle="italic">
                {index + 1}
              </Text>
              <YStack flex={1} gap={1}>
                <Text
                  color={active ? palette.accent : palette.text}
                  fontSize={13.5}
                  fontWeight="600"
                  numberOfLines={1}>
                  {song.title}
                </Text>
                <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
                  {song.artist}
                </Text>
              </YStack>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
});
