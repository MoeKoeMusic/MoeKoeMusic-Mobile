import { useColorScheme } from 'react-native';

import { Palette, type AppPalette } from '@/constants/theme';

export function usePalette(): AppPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Palette.dark : Palette.light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
