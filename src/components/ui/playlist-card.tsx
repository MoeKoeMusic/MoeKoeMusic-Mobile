import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { usePalette } from '@/hooks/use-palette';

type PlaylistCardProps = {
  title: string;
  coverUrl: string | null;
  playCountText?: string;
  width: number;
  onPress: () => void;
};

export const PlaylistCard = memo(function PlaylistCard({
  title,
  coverUrl,
  playCountText,
  width,
  onPress,
}: PlaylistCardProps) {
  const palette = usePalette();

  return (
    <YStack
      width={width}
      gap={8}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <View>
        <Artwork uri={coverUrl} radius={18} />
        {playCountText ? (
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
              {playCountText}
            </Text>
          </XStack>
        ) : null}
      </View>
      <Text
        color={palette.text}
        fontSize={13}
        fontWeight="600"
        lineHeight={18}
        numberOfLines={2}
        paddingHorizontal={2}>
        {title}
      </Text>
    </YStack>
  );
});
