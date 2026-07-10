import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { View } from 'tamagui';

import type { HomeBanner } from '@/features/home/load-home-data';
import { usePalette } from '@/hooks/use-palette';

const AUTO_SCROLL_INTERVAL_MS = 4200;
const BANNER_GAP = 12;
/** 判定滚动已停稳的偏移误差(px),超出说明惯性还没结束。 */
const SETTLE_EPSILON = 2;

type BannerCarouselProps = {
  banners: HomeBanner[];
  bannerWidth: number;
  bannerHeight: number;
  onPressBanner: (banner: HomeBanner) => void;
};

/**
 * 无缝循环轮播:真实页两端各补一张克隆页(头补最后一张、尾补第一张),
 * 滑进克隆页后瞬时跳回对应真实页,画面内容相同故无感;自动轮播同理先跳后滑。
 */
export function BannerCarousel({
  banners,
  bannerWidth,
  bannerHeight,
  onPressBanner,
}: BannerCarouselProps) {
  const palette = usePalette();
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const interactingRef = useRef(false);
  const layoutKeyRef = useRef('');
  const step = bannerWidth + BANNER_GAP;
  const realCount = banners.length;
  const looping = realCount > 1;

  const slides = looping
    ? [
        { key: `head-${banners[realCount - 1].id}`, banner: banners[realCount - 1] },
        ...banners.map((banner) => ({ key: banner.id, banner })),
        { key: `tail-${banners[0].id}`, banner: banners[0] },
      ]
    : banners.map((banner) => ({ key: banner.id, banner }));

  function jumpTo(x: number) {
    scrollRef.current?.scrollTo({ x, animated: false });
    offsetRef.current = x;
  }

  /** 停稳后若落在克隆页,瞬时跳回同画面的真实页。 */
  function handleSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    offsetRef.current = x;
    if (!looping) {
      return;
    }

    const position = Math.round(x / step);
    if (Math.abs(x - position * step) > SETTLE_EPSILON) {
      return;
    }

    interactingRef.current = false;
    if (position <= 0) {
      jumpTo(realCount * step);
    } else if (position >= realCount + 1) {
      jumpTo(step);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!looping) {
        return;
      }

      const timer = setInterval(() => {
        if (interactingRef.current) {
          return;
        }

        const position = Math.round(offsetRef.current / step);
        if (position >= realCount) {
          // 到达真实末页:先无感跳到头部克隆页(画面相同),再前滑进第一张
          jumpTo(0);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ x: step, animated: true });
            offsetRef.current = step;
          });
          return;
        }

        const target = (position + 1) * step;
        scrollRef.current?.scrollTo({ x: target, animated: true });
        offsetRef.current = target;
      }, AUTO_SCROLL_INTERVAL_MS);

      return () => clearInterval(timer);
    }, [looping, realCount, step])
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={(event) => {
        offsetRef.current = event.nativeEvent.contentOffset.x;
      }}
      onScrollBeginDrag={() => {
        interactingRef.current = true;
      }}
      onScrollEndDrag={handleSettle}
      onMomentumScrollEnd={handleSettle}
      onContentSizeChange={() => {
        // 初次布局(或数量/尺寸变化)后定位到第一张真实页
        const layoutKey = `${realCount}-${step}`;
        if (looping && layoutKeyRef.current !== layoutKey) {
          layoutKeyRef.current = layoutKey;
          jumpTo(step);
        }
      }}
      contentContainerStyle={styles.list}>
      {slides.map(({ key, banner }) => {
        const navigable = Boolean(banner.playlistGid || banner.linkUrl);
        return (
          <View
            key={key}
            width={bannerWidth}
            height={bannerHeight}
            borderRadius={22}
            overflow="hidden"
            backgroundColor={palette.cardAlt}
            transition="quickest"
            pressStyle={navigable ? { opacity: 0.85, scale: 0.99 } : undefined}
            onPress={navigable ? () => onPressBanner(banner) : undefined}>
            <Image
              source={banner.imageUrl ?? undefined}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={220}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: BANNER_GAP,
  },
});
