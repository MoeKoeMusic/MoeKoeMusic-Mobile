import { Text, XStack, YStack } from 'tamagui';

import { usePalette } from '@/hooks/use-palette';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const palette = usePalette();

  return (
    <XStack alignItems="flex-end" justifyContent="space-between" gap="$3">
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={20} fontWeight="700" letterSpacing={0.2}>
          {title}
        </Text>
        {subtitle ? (
          <Text color={palette.textTertiary} fontSize={12.5}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {actionLabel && onAction ? (
        <Text
          color={palette.accent}
          fontSize={13.5}
          fontWeight="600"
          paddingVertical={4}
          pressStyle={{ opacity: 0.6 }}
          onPress={onAction}
          suppressHighlighting>
          {actionLabel}
        </Text>
      ) : null}
    </XStack>
  );
}
