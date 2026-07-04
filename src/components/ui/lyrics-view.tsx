import { useEffect, useRef, useState } from 'react';
import { ScrollView, type LayoutChangeEvent } from 'react-native';
import { Spinner, Text, YStack } from 'tamagui';

import type { LyricLine, LyricsStatus } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

type LyricsViewProps = {
  lines: LyricLine[];
  activeIndex: number;
  status: LyricsStatus;
  onSeekLine?: (line: LyricLine) => void;
};

const RESUME_AUTO_SCROLL_MS = 3500;

export function LyricsView({ lines, activeIndex, status, onSeekLine }: LyricsViewProps) {
  const palette = usePalette();
  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const userScrollUntil = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);

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
      {lines.map((line, index) => {
        const active = index === activeIndex;
        return (
          <Text
            key={`${line.timeMs}-${index}`}
            onLayout={(event) => {
              lineOffsets.current[index] = event.nativeEvent.layout.y;
            }}
            onPress={onSeekLine ? () => onSeekLine(line) : undefined}
            suppressHighlighting
            textAlign="center"
            paddingVertical={11}
            color={active ? palette.accent : palette.textSecondary}
            opacity={active ? 1 : 0.6}
            fontSize={active ? 19 : 15.5}
            lineHeight={active ? 27 : 23}
            fontWeight={active ? '700' : '500'}>
            {line.text}
          </Text>
        );
      })}
    </ScrollView>
  );
}
