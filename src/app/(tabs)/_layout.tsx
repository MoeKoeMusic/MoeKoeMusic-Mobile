import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/ui/mini-player';
import {
  TabBarHeight,
  TabBarSideMargin,
  TabletDockMaxWidth,
  TabletTabBarMaxWidth,
} from '@/constants/layout';
import { useIsTablet } from '@/hooks/use-is-tablet';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type TabGlyph = 'home' | 'compass' | 'person';

const TAB_ROUTES: { name: string; title: string; glyph: TabGlyph; label: string }[] = [
  { name: 'index', title: '首页', glyph: 'home', label: '首页' },
  { name: 'discover', title: '发现', glyph: 'compass', label: '发现' },
  { name: 'me', title: '我的', glyph: 'person', label: '我的' },
];

export default function TabsLayout() {
  const palette = usePalette();
  const isDark = useIsDark();
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const barHeight = isTablet ? TabBarHeight : TabBarHeight + insets.bottom;

  // 平板：导航条是居中悬浮胶囊，MiniPlayer 悬浮在其上方；手机：沿用全宽底部栏
  const tabBarWidth = isTablet ? Math.min(width - 48, TabletTabBarMaxWidth) : width;
  const tabBarLeft = (width - tabBarWidth) / 2;
  const tabBarBottom = isTablet ? insets.bottom + 10 : 0;

  const dockWidth = Math.min(width - TabBarSideMargin * 2, isTablet ? TabletDockMaxWidth : 680);
  const dockLeft = (width - dockWidth) / 2;
  const dockBottom = tabBarBottom + barHeight + 8;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: palette.background },
          tabBarShowLabel: true,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.textTertiary,
          tabBarPosition: 'bottom',
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: {
            fontSize: 10.5,
            fontWeight: '600',
          },
          tabBarStyle: {
            position: 'absolute',
            left: tabBarLeft,
            width: tabBarWidth,
            bottom: tabBarBottom,
            height: barHeight,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.border,
            backgroundColor: palette.barSurface,
            borderRadius: isTablet ? 28 : 0,
            borderColor: isTablet ? palette.border : undefined,
            borderWidth: isTablet ? StyleSheet.hairlineWidth : 0,
            shadowColor: palette.dockShadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.08,
            shadowRadius: 22,
            elevation: isTablet ? 12 : 10,
          },
        }}>
        {TAB_ROUTES.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? tab.glyph : (`${tab.glyph}-outline` as const)}
                  size={isTablet ? 25 : 23}
                  color={color}
                />
              ),
            }}
          />
        ))}
      </Tabs>

      {keyboardVisible ? null : (
        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              bottom: dockBottom,
              left: dockLeft,
              width: dockWidth,
            },
          ]}>
          <MiniPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dock: {
    position: 'absolute',
  },
});
