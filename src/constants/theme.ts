export const Palette = {
  light: {
    accent: '#FA2D48',
    accentPressed: '#E01F3D',
    accentSoft: 'rgba(250, 45, 72, 0.10)',
    accentBorder: 'rgba(250, 45, 72, 0.24)',
    onAccent: '#FFFFFF',
    gradientStart: '#FB5D74',
    gradientEnd: '#FA2D48',
    background: '#FFFFFF',
    card: '#F2F2F7',
    cardAlt: '#E5E5EA',
    border: 'rgba(60, 60, 67, 0.12)',
    text: '#000000',
    textSecondary: 'rgba(60, 60, 67, 0.60)',
    textTertiary: 'rgba(60, 60, 67, 0.30)',
    placeholderStart: '#FBD3DA',
    placeholderEnd: '#EFEFF4',
    danger: '#FF3B30',
    dangerSoft: 'rgba(255, 59, 48, 0.12)',
    barSurface: 'rgba(250, 250, 252, 0.92)',
    dockShadow: '#1C1C28',
    vip: '#B97B1F',
    vipSoft: 'rgba(240, 184, 90, 0.18)',
    playerTop: '#FDE9EC',
    playerBottom: '#FFFFFF',
  },
  dark: {
    accent: '#FF4557',
    accentPressed: '#FF6B7A',
    accentSoft: 'rgba(255, 69, 87, 0.16)',
    accentBorder: 'rgba(255, 69, 87, 0.34)',
    onAccent: '#FFFFFF',
    gradientStart: '#FF6B7A',
    gradientEnd: '#FA2D48',
    background: '#000000',
    card: '#1C1C1E',
    cardAlt: '#2C2C2E',
    border: 'rgba(255, 255, 255, 0.10)',
    text: '#FFFFFF',
    textSecondary: 'rgba(235, 235, 245, 0.60)',
    textTertiary: 'rgba(235, 235, 245, 0.30)',
    placeholderStart: '#3A2226',
    placeholderEnd: '#1C1C20',
    danger: '#FF453A',
    dangerSoft: 'rgba(255, 69, 58, 0.16)',
    barSurface: 'rgba(18, 18, 22, 0.92)',
    dockShadow: '#000000',
    vip: '#F0C065',
    vipSoft: 'rgba(240, 192, 101, 0.14)',
    playerTop: '#2A1518',
    playerBottom: '#000000',
  },
} as const;

export type SchemeName = 'light' | 'dark';

/** Tamagui 严格样式值只接受 hex/rgba 模板字面量,不接受宽泛 string。 */
export type PaletteColor = `#${string}` | `rgba(${string})`;

export type AppPalette = { [K in keyof (typeof Palette)['light']]: PaletteColor };

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

export const MaxContentWidth = 1040;
export const WideBreakpoint = 680;
