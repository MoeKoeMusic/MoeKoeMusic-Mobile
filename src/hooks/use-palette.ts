import { useColorScheme } from 'react-native';

import { getPalette } from '@/constants/accents';
import type { AppPalette, SchemeName } from '@/constants/theme';
import { useAccentId, useThemeMode } from '@/features/settings/store';

export function useEffectiveScheme(): SchemeName {
  const systemScheme = useColorScheme();
  const themeMode = useThemeMode();
  if (themeMode === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return themeMode;
}

export function usePalette(): AppPalette {
  const scheme = useEffectiveScheme();
  const accentId = useAccentId();
  return getPalette(accentId, scheme);
}

export function useIsDark(): boolean {
  return useEffectiveScheme() === 'dark';
}
