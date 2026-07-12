import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, type LayoutChangeEvent } from 'react-native';
import { Spinner, Text, YStack } from 'tamagui';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { usePlayerProgressSelector } from '@/features/player/store';
import type { LyricLine, LyricsStatus } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

type LyricsViewProps = {
  lines: LyricLine[];
  status: LyricsStatus;
  onSeekLine?: (line: LyricLine) => void;
};

const RESUME_AUTO_SCROLL_MS = 3500;

type LyricRowProps = {
  line: LyricLine;
  index: number;
  active: boolean;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (index: number, offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
};

const LyricRow = memo(function LyricRow({
  line,
  index,
  active,
  activeColor,
  inactiveColor,
  onLayoutLine,
  onSeekLine,
}: LyricRowProps) {
  return (
    <Text
      onLayout={(event) => onLayoutLine(index, event.nativeEvent.layout.y)}
      onPress={onSeekLine ? () => onSeekLine(line) : undefined}
      suppressHighlighting
      textAlign="center"
      paddingVertical={11}
      color={active ? activeColor : inactiveColor}
      opacity={active ? 1 : 0.58}
      fontSize={16}
      lineHeight={25}
      fontWeight={active ? '700' : '500'}
      transform={[{ scale: active ? 1.08 : 1 }]}
      transition="quick">
      {line.text}
    </Text>
  );
});

export function LyricsView({ lines, status, onSeekLine }: LyricsViewProps) {
  const palette = usePalette();
  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const userScrollUntil = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const activeIndex = usePlayerProgressSelector(({ positionMs }) =>
    findActiveLyricIndex(lines, positionMs + 240)
  );

  const handleLayoutLine = useCallback((index: number, offset: number) => {
    lineOffsets.current[index] = offset;
  }, []);

  useEffect(() => {
    lineOffsets.current = [];
  }, [lines]);

  useEffect(() => {
    if (activeIndex < 0 || !viewportHeight || Date.now() < userScrollUntil.current) {
      return;
    }

    const offset = lineOffsets.current[activeIndex];
    if (typeof offset !== 'number') {
      return;
    }

    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - viewportHeight * 0.42),
      animated: true,
    });
  }, [activeIndex, viewportHeight]);

  if (status === 'loading' || status === 'idle') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={12}>
        <Spinner size="large" color={palette.accent} />
        <Text color={palette.textTertiary} fontSize={13}>
          歌词加载中
        </Text>
      </YStack>
    );
  }

  if (!lines.length) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={6}>
        <Text color={palette.textSecondary} fontSize={16} fontWeight="600">
          暂无歌词
        </Text>
        <Text color={palette.textTertiary} fontSize={12.5}>
          纯音乐，请欣赏
        </Text>
      </YStack>
    );
  }

  return (
    <MaskedView
      style={{ flex: 1 }}
      androidRenderingMode="hardware"
      maskElement={
        <LinearGradient
          colors={['transparent', 'black', 'black', 'transparent']}
          locations={[0, 0.14, 0.84, 1]}
          style={{ flex: 1 }}
        />
      }>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScrollBeginDrag={() => {
          userScrollUntil.current = Date.now() + RESUME_AUTO_SCROLL_MS;
        }}
        contentContainerStyle={{
          paddingVertical: viewportHeight ? viewportHeight * 0.42 : 200,
          paddingHorizontal: 28,
        }}>
        {lines.map((line, index) => (
          <LyricRow
            key={`${line.timeMs}-${index}`}
            line={line}
            index={index}
            active={index === activeIndex}
            activeColor={palette.accent}
            inactiveColor={palette.textSecondary}
            onLayoutLine={handleLayoutLine}
            onSeekLine={onSeekLine}
          />
        ))}
      </ScrollView>
    </MaskedView>
  );
}
