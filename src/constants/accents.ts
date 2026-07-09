import { Palette, type AppPalette, type PaletteColor, type SchemeName } from '@/constants/theme';

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): `#${string}` {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase() as `#${string}`;
}

/** 按 t 权重向 target 做 sRGB 每通道线性插值。 */
export function mixHex(base: string, target: string, t: number): `#${string}` {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

const tint = (hex: string, t: number) => mixHex(hex, '#FFFFFF', t);
const shade = (hex: string, t: number) => mixHex(hex, '#000000', t);

export function withAlpha(hex: string, alpha: number): `rgba(${string})` {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type AccentPresetId = 'pink' | 'blue' | 'purple' | 'green' | 'cyan' | 'orange' | 'red';

type AccentOverlay = Pick<
  AppPalette,
  | 'accent'
  | 'accentPressed'
  | 'accentSoft'
  | 'accentBorder'
  | 'onAccent'
  | 'gradientStart'
  | 'gradientEnd'
  | 'placeholderStart'
  | 'playerTop'
>;

export type AccentPreset = {
  id: AccentPresetId;
  label: string;
  light: string;
  dark: string;
  /** 某预设某字段派生效果不佳时的逐字段覆写逃生舱。 */
  overrides?: Partial<Record<SchemeName, Partial<AccentOverlay>>>;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'pink', label: '樱花粉', light: '#FF5C9E', dark: '#FF7EB6' },
  { id: 'blue', label: '海空蓝', light: '#3D8BFF', dark: '#66A3FF' },
  { id: 'purple', label: '星紫', light: '#8B5CF6', dark: '#A37EF8' },
  { id: 'green', label: '薄荷绿', light: '#12B886', dark: '#44C79F' },
  { id: 'cyan', label: '湖水青', light: '#00B8D9', dark: '#36C7E1' },
  { id: 'orange', label: '落日橙', light: '#FF7A45', dark: '#FF966C' },
  { id: 'red', label: '绯红', light: '#F43F5E', dark: '#F66780' },
];

export const DEFAULT_ACCENT_ID: AccentPresetId = 'pink';

export function isAccentPresetId(value: unknown): value is AccentPresetId {
  return typeof value === 'string' && ACCENT_PRESETS.some((preset) => preset.id === value);
}

/** 派生系数用现有粉色手写值校准:对 #FF5C9E/#FF7EB6 输出精确或 Δ≤7 且均在非交互面上。 */
function buildAccentOverlay(preset: AccentPreset, scheme: SchemeName): AccentOverlay {
  const { light, dark } = preset;
  const shared = { gradientStart: tint(light, 0.3), gradientEnd: light as PaletteColor };
  const overlay: AccentOverlay =
    scheme === 'light'
      ? {
          accent: light as PaletteColor,
          accentPressed: shade(light, 0.08) as PaletteColor,
          accentSoft: withAlpha(light, 0.1) as PaletteColor,
          accentBorder: withAlpha(light, 0.24) as PaletteColor,
          onAccent: '#FFFFFF' as PaletteColor,
          ...shared,
          placeholderStart: tint(light, 0.83) as PaletteColor,
          playerTop: tint(light, 0.91) as PaletteColor,
        }
      : {
          accent: dark as PaletteColor,
          accentPressed: tint(dark, 0.16) as PaletteColor,
          accentSoft: withAlpha(dark, 0.14) as PaletteColor,
          accentBorder: withAlpha(dark, 0.32) as PaletteColor,
          onAccent: shade(dark, 0.87) as PaletteColor,
          ...shared,
          placeholderStart: mixHex(dark, Palette.dark.background, 0.86) as PaletteColor,
          playerTop: mixHex(dark, Palette.dark.background, 0.9) as PaletteColor,
        };
  return { ...overlay, ...preset.overrides?.[scheme] };
}

const paletteCache = new Map<string, AppPalette>();

/** 合成 palette;同 (accentId, scheme) 永远返回同一对象引用,保证下游 memo 有效。 */
export function getPalette(accentId: AccentPresetId, scheme: SchemeName): AppPalette {
  const key = `${accentId}:${scheme}`;
  let cached = paletteCache.get(key);
  if (!cached) {
    const preset = ACCENT_PRESETS.find((item) => item.id === accentId) ?? ACCENT_PRESETS[0];
    cached = { ...Palette[scheme], ...buildAccentOverlay(preset, scheme) };
    paletteCache.set(key, cached);
  }
  return cached;
}
