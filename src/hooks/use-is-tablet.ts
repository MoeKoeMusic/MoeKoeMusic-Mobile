import { useWindowDimensions } from 'react-native';

import { SidebarBreakpoint } from '@/constants/layout';

/**
 * 窗口短边 ≥ 阈值视为平板（横竖屏一致）。
 * 用短边而不是宽边，避免手机横屏误判成平板布局。
 */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= SidebarBreakpoint;
}
