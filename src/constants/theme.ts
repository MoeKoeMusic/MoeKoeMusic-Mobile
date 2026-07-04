export const Palette = {
  light: {
    accent: '#FF5C9E',
    accentPressed: '#F04E90',
    accentSoft: 'rgba(255, 92, 158, 0.10)',
    accentBorder: 'rgba(255, 92, 158, 0.24)',
    onAccent: '#FFFFFF',
    gradientStart: '#FF8AC2',
    gradientEnd: '#FF5C9E',
    background: '#F7F7FA',
    card: '#FFFFFF',
    cardAlt: '#F1F2F6',
    border: 'rgba(17, 24, 39, 0.06)',
    text: '#12131F',
    textSecondary: '#6E7386',
    textTertiary: '#9DA2B3',
    placeholderStart: '#FFE3F0',
    placeholderEnd: '#E9EBFF',
    danger: '#E5484D',
    dangerSoft: 'rgba(229, 72, 77, 0.10)',
    barSurface: 'rgba(255, 255, 255, 0.98)',
    dockShadow: '#0F172A',
    vip: '#B97B1F',
    vipSoft: 'rgba(240, 184, 90, 0.18)',
    playerTop: '#FFF0F7',
    playerBottom: '#F7F7FA',
  },
  dark: {
    accent: '#FF7EB6',
    accentPressed: '#FF93C2',
    accentSoft: 'rgba(255, 126, 182, 0.14)',
    accentBorder: 'rgba(255, 126, 182, 0.32)',
    onAccent: '#231018',
    gradientStart: '#FF8AC2',
    gradientEnd: '#FF5C9E',
    background: '#0E0F16',
    card: '#181A24',
    cardAlt: '#20222F',
    border: 'rgba(255, 255, 255, 0.07)',
    text: '#F4F5F9',
    textSecondary: '#A6ABBD',
    textTertiary: '#6F7488',
    placeholderStart: '#2C2335',
    placeholderEnd: '#1E2233',
    danger: '#FF6369',
    dangerSoft: 'rgba(255, 99, 105, 0.14)',
    barSurface: 'rgba(19, 21, 31, 0.98)',
    dockShadow: '#000000',
    vip: '#F0C065',
    vipSoft: 'rgba(240, 192, 101, 0.14)',
    playerTop: '#241722',
    playerBottom: '#0E0F16',
  },
} as const;

export type AppPalette = (typeof Palette)['light'] | (typeof Palette)['dark'];

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export const MaxContentWidth = 800;
export const WideBreakpoint = 680;
