import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TabPalette = {
  accent: string;
  accentSoft: string;
  iconMuted: string;
  labelMuted: string;
  barSurface: string;
  barBorder: string;
  centerRing: string;
};

function buildPalette(scheme: 'light' | 'dark'): TabPalette {
  if (scheme === 'dark') {
    return {
      accent: '#67E8F9',
      accentSoft: 'rgba(103, 232, 249, 0.18)',
      iconMuted: '#8D99AE',
      labelMuted: '#90A4B8',
      barSurface: '#0F1722',
      barBorder: 'rgba(255, 255, 255, 0.08)',
      centerRing: 'rgba(255, 255, 255, 0.92)',
    };
  }

  return {
    accent: '#1EC8C1',
    accentSoft: '#E9FBF9',
    iconMuted: '#97A0AF',
    labelMuted: '#8D96A5',
    barSurface: '#FFFFFF',
    barBorder: 'rgba(15, 23, 42, 0.08)',
    centerRing: '#FFFFFF',
  };
}

function HomeGlyph({ focused, palette }: { focused: boolean; palette: TabPalette }) {
  const tint = focused ? palette.accent : palette.iconMuted;
  return (
    <View style={styles.homeGlyph}>
      <View style={[styles.homeGlyphCell, { backgroundColor: tint }]} />
      <View style={[styles.homeGlyphCell, { backgroundColor: tint, opacity: 0.72 }]} />
      <View style={[styles.homeGlyphWide, { backgroundColor: tint }]} />
    </View>
  );
}

function UserGlyph({ focused, palette }: { focused: boolean; palette: TabPalette }) {
  const tint = focused ? palette.accent : palette.iconMuted;
  return (
    <View style={styles.userGlyph}>
      <View style={[styles.userHead, { backgroundColor: tint }]} />
      <View style={[styles.userBody, { borderColor: tint }]} />
    </View>
  );
}

function SideTabIcon({
  focused,
  palette,
  label,
  glyph,
}: {
  focused: boolean;
  palette: TabPalette;
  label: string;
  glyph: ReactNode;
}) {
  return (
    <View style={styles.sideTabItem}>
      <View
        style={[
          styles.sideIconWrap,
          { backgroundColor: focused ? palette.accentSoft : 'transparent' },
        ]}>
        {glyph}
      </View>
      <Text style={[styles.sideLabel, { color: focused ? palette.accent : palette.labelMuted }]}>
        {label}
      </Text>
    </View>
  );
}

function CenterTabButton({
  palette,
  selected,
  ...props
}: PressableProps & {
  accessibilityState?: {
    selected?: boolean;
  };
  palette: TabPalette;
  selected?: boolean;
}) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.centerTabButton,
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.centerTabOuter,
          {
            borderColor: palette.centerRing,
            shadowColor: Colors.light.text,
            opacity: selected ? 1 : 0.96,
          },
        ]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.centerTabImage}
          contentFit="cover"
        />
        <View
          style={[
            styles.centerTabDot,
            {
              backgroundColor: palette.accent,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const palette = buildPalette(scheme);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: palette.barSurface,
            borderTopColor: palette.barBorder,
          },
        ],
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ focused }) => (
            <SideTabIcon
              focused={focused}
              palette={palette}
              label="发现"
              glyph={<HomeGlyph focused={focused} palette={palette} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="player"
        options={{
          title: '播放',
          tabBarButton: (props) => (
            <CenterTabButton
              {...props}
              palette={palette}
              selected={Boolean(props.accessibilityState?.selected)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: '我的',
          tabBarIcon: ({ focused }) => (
            <SideTabIcon
              focused={focused}
              palette={palette}
              label="我的"
              glyph={<UserGlyph focused={focused} palette={palette} />}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    height: 78,
    borderTopWidth: 1,
    borderRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 0,
  },
  sideTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 62,
  },
  sideIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 14,
  },
  homeGlyph: {
    width: 17,
    height: 17,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    alignItems: 'flex-start',
  },
  homeGlyphCell: {
    width: 7,
    height: 7,
    borderRadius: 3,
  },
  homeGlyphWide: {
    width: 17,
    height: 4,
    borderRadius: 2,
  },
  userGlyph: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  userHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userBody: {
    width: 14,
    height: 8,
    borderRadius: 6,
    borderWidth: 2,
  },
  centerTabButton: {
    top: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTabOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 0,
  },
  centerTabImage: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  centerTabDot: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pressed: {
    opacity: 0.82,
  },
});
