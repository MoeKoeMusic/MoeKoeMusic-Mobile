import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Spinner, Text, YStack } from 'tamagui';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { usePlayerProgressSelector } from '@/features/player/store';
import type { LyricLine, LyricsStatus } from '@/features/player/types';
import {
  useLyricAlign,
  useLyricFontSize,
  useLyricTranslationFontSize,
  useShowLyricTranslation,
  type LyricAlign,
} from '@/features/settings/store';
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
  align: LyricAlign;
  fontSize: number;
  showTranslation: boolean;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (index: number, offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
};

/** 翻译行：无论所在行是否正在播放，永远为次级灰色（颜色在此处固化，不经调用方传入）。 */
function TranslationText({
  line,
  align,
  fontSize,
}: {
  line: LyricLine;
  align: LyricAlign;
  fontSize: number;
}) {
  const palette = usePalette();
  if (!line.translation) {
    return null;
  }

  return (
    <Text
      suppressHighlighting
      textAlign={align === 'center' ? 'center' : 'left'}
      color={palette.textSecondary}
      opacity={0.85}
      fontSize={fontSize}
      lineHeight={Math.round(fontSize * 1.3)}
      style={styles.translationText}>
      {line.translation}
    </Text>
  );
}

const LyricRow = memo(function LyricRow({
  line,
  index,
  active,
  align,
  fontSize,
  showTranslation,
  activeColor,
  inactiveColor,
  onLayoutLine,
  onSeekLine,
}: LyricRowProps) {
  const translationFontSize = useLyricTranslationFontSize();
  return (
    <View
      onLayout={(event) => onLayoutLine(index, event.nativeEvent.layout.y)}
      style={styles.row}>
      <Text
        onPress={onSeekLine ? () => onSeekLine(line) : undefined}
        suppressHighlighting
        textAlign={align === 'center' ? 'center' : 'left'}
        color={active ? activeColor : inactiveColor}
        opacity={active ? 1 : 0.45}
        fontSize={fontSize}
        lineHeight={Math.round(fontSize * 1.36)}
        style={styles.lineText}>
        {line.text}
      </Text>
      {showTranslation ? (
        <TranslationText
          line={line}
          align={align}
          fontSize={translationFontSize}
        />
      ) : null}
    </View>
  );
});

export function LyricsView({ lines, status, onSeekLine }: LyricsViewProps) {
  const palette = usePalette();
  const lyricAlign = useLyricAlign();
  const lyricFontSize = useLyricFontSize();
  const showTranslation = useShowLyricTranslation();
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
    // alpha 遮罩让歌词本身在上下边缘淡出，透出后面的动态取色背景，
    // 因此不能用任何实色渐变条（背景色会与封面取色背景冲突）
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
            align={lyricAlign}
            fontSize={lyricFontSize}
            showTranslation={showTranslation}
            activeColor={palette.text}
            inactiveColor={palette.textSecondary}
            onLayoutLine={handleLayoutLine}
            onSeekLine={onSeekLine}
          />
        ))}
      </ScrollView>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 13,
  },
  lineText: {
    includeFontPadding: false,
    fontFamily: 'MiSans-Bold',
  },
  translationText: {
    includeFontPadding: false,
    marginTop: 5,
    fontFamily: 'MiSans-Medium',
  },
});
