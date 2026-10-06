import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Switch, Text, XStack, YStack } from 'tamagui';

import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  settingsActions,
  useLyricAlign,
  useLyricFontSize,
  useLyricTranslationFontSize,
  useShowLyricTranslation,
  type LyricAlign,
  type LyricFontSize,
  type LyricTranslationFontSize,
} from '@/features/settings/store';
import { usePalette } from '@/hooks/use-palette';

type Option<T> = {
  value: T;
  label: string;
  hint?: string;
};

type OptionsSheetProps<T> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly Option<T>[];
  value: T;
  onSelect: (value: T) => void;
};

/** 单选弹层：用于播放页音质等场景。 */
export function OptionsSheet<T extends string | number>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onSelect,
}: OptionsSheetProps<T>) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      transition="medium"
      zIndex={100001}>
      <Sheet.Overlay
        transition="quick"
        backgroundColor="rgba(8, 8, 14, 0.42)"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Handle backgroundColor={palette.cardAlt} width={40} alignSelf="center" />
      <Sheet.Frame backgroundColor={palette.card} paddingTop={14} paddingBottom={Math.max(insets.bottom, 16) + 8}>
        <Text color={palette.text} fontSize={16} fontWeight="700" textAlign="center" paddingBottom={6}>
          {title}
        </Text>
        <YStack>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <XStack
                key={String(option.value)}
                alignItems="center"
                paddingHorizontal={18}
                paddingVertical={13}
                gap={12}
                transition="quickest"
                pressStyle={{ backgroundColor: palette.cardAlt }}
                onPress={() => {
                  onSelect(option.value);
                  onOpenChange(false);
                }}>
                <YStack flex={1} gap={2}>
                  <Text color={active ? palette.accent : palette.text} fontSize={14.5} fontWeight={active ? '700' : '500'}>
                    {option.label}
                  </Text>
                  {option.hint ? (
                    <Text color={palette.textTertiary} fontSize={11.5}>
                      {option.hint}
                    </Text>
                  ) : null}
                </YStack>
                {active ? <Ionicons name="checkmark" size={18} color={palette.accent} /> : null}
              </XStack>
            );
          })}
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
}

const LYRIC_ALIGN_OPTIONS = [
  { value: 'center', label: '居中对齐' },
  { value: 'left', label: '左对齐' },
] as const;

const LYRIC_FONT_OPTIONS = [
  { value: '18', label: '小' },
  { value: '22', label: '标准' },
  { value: '26', label: '大' },
] as const;

const LYRIC_TRANSLATION_FONT_OPTIONS = [
  { value: '13', label: '小' },
  { value: '15', label: '标准' },
  { value: '18', label: '大' },
] as const;

/** 歌词设置弹层：对齐方式 + 字号，播放页歌词页右上角入口。 */
export function LyricSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const lyricAlign = useLyricAlign();
  const lyricFontSize = useLyricFontSize();
  const showLyricTranslation = useShowLyricTranslation();
  const lyricTranslationFontSize = useLyricTranslationFontSize();

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      transition="medium"
      zIndex={100001}>
      <Sheet.Overlay
        transition="quick"
        backgroundColor="rgba(8, 8, 14, 0.42)"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Handle backgroundColor={palette.cardAlt} width={40} alignSelf="center" />
      <Sheet.Frame
        backgroundColor={palette.card}
        padding={18}
        paddingTop={14}
        paddingBottom={Math.max(insets.bottom, 16) + 8}
        gap={16}>
        <Text color={palette.text} fontSize={16} fontWeight="700" textAlign="center">
          歌词设置
        </Text>
        <YStack gap={10}>
          <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
            对齐方式
          </Text>
          <SegmentedControl
            options={LYRIC_ALIGN_OPTIONS}
            value={lyricAlign}
            onChange={(next) => settingsActions.setLyricAlign(next as LyricAlign)}
          />
        </YStack>
        <YStack gap={10}>
          <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
            字体大小
          </Text>
          <SegmentedControl
            options={LYRIC_FONT_OPTIONS}
            value={String(lyricFontSize)}
            onChange={(next) => settingsActions.setLyricFontSize(Number(next) as LyricFontSize)}
          />
        </YStack>
        <XStack alignItems="center" gap={12}>
          <YStack flex={1} gap={2}>
            <Text color={palette.text} fontSize={14.5} fontWeight="600">
              显示翻译
            </Text>
            <Text color={palette.textTertiary} fontSize={11.5} lineHeight={16}>
              外国歌曲在歌词下方显示中文翻译
            </Text>
          </YStack>
          <Switch
            size="$2"
            checked={showLyricTranslation}
            onCheckedChange={(checked) => settingsActions.setShowLyricTranslation(checked)}
            backgroundColor={showLyricTranslation ? palette.accent : palette.cardAlt}
            borderWidth={0}>
            <Switch.Thumb backgroundColor="#FFFFFF" />
          </Switch>
        </XStack>
        {showLyricTranslation ? (
          <YStack gap={10}>
            <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
              翻译字号
            </Text>
            <SegmentedControl
              options={LYRIC_TRANSLATION_FONT_OPTIONS}
              value={String(lyricTranslationFontSize)}
              onChange={(next) =>
                settingsActions.setLyricTranslationFontSize(Number(next) as LyricTranslationFontSize)
              }
            />
          </YStack>
        ) : null}
      </Sheet.Frame>
    </Sheet>
  );
}
