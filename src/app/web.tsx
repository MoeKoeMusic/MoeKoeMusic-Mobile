import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { usePalette } from '@/hooks/use-palette';

/** 应用内网页容器 */
export default function WebScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const url = typeof params.url === 'string' && /^https?:\/\//.test(params.url) ? params.url : '';
  const [pageTitle, setPageTitle] = useState(
    typeof params.title === 'string' ? params.title : ''
  );
  const [loading, setLoading] = useState(true);

  return (
    <YStack flex={1} backgroundColor={palette.background} paddingTop={insets.top + 10}>
      <XStack alignItems="center" gap={12} paddingHorizontal={16} paddingBottom={10}>
        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.card}
          borderWidth={StyleSheet.hairlineWidth}
          borderColor={palette.border}
          transition="quickest"
          pressStyle={{ opacity: 0.7, scale: 0.96 }}
          onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={palette.text} />
        </XStack>
        <Text
          flex={1}
          color={palette.text}
          fontSize={17}
          fontWeight="700"
          numberOfLines={1}
          letterSpacing={0.2}>
          {pageTitle || '网页'}
        </Text>
        {loading ? <Spinner size="small" color={palette.accent} /> : null}
      </XStack>

      {url ? (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: palette.background }}
          domStorageEnabled
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => {
            // 没传标题时跟随网页自身标题
            if (!params.title && navState.title) {
              setPageTitle(navState.title);
            }
          }}
        />
      ) : (
        <View flex={1} alignItems="center" justifyContent="center" gap={10}>
          <Ionicons name="unlink-outline" size={40} color={palette.textTertiary} />
          <Text color={palette.textTertiary} fontSize={13.5}>
            链接无效或已失效
          </Text>
        </View>
      )}
    </YStack>
  );
}
