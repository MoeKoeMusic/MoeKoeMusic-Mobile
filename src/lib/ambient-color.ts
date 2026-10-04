import { decode as decodeJpeg } from 'jpeg-js';

const HUE_BINS = 36;

/** 颜色缓存按 URL 记 Promise：同一封面只取一次，也避免并发重复请求。 */
const cache = new Map<string, Promise<string | null>>();

/**
 * 从封面图提取一个"鲜活"的主题色。纯 JS 解 JPEG，不依赖原生模块；
 * 灰白封面或非 JPEG（PNG 等）返回 null，调用方回退到中性配色。
 */
export function extractAmbientColor(url: string): Promise<string | null> {
  let cached = cache.get(url);
  if (!cached) {
    cached = extract(url).catch(() => null);
    cache.set(url, cached);
  }
  return cached;
}

async function extract(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  // 只解 JPEG（酷狗封面绝大多数是 jpg）；其他格式交给中性回退
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  const { data, width, height } = decodeJpeg(bytes, { useTArray: true });
  // 采样缩到约 4k 像素，足够判定主色调，速度也快
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 4096)));
  const bins = Array.from({ length: HUE_BINS }, () => ({
    weight: 0,
    sin: 0,
    cos: 0,
    sat: 0,
    lig: 0,
    count: 0,
  }));
  let colored = false;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const { h, s, l } = rgbToHsl(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      // 过滤掉接近黑白灰的像素，避免白边/黑底把主色带偏
      if (s < 0.22 || l < 0.14 || l > 0.86) {
        continue;
      }
      colored = true;
      const bin = bins[Math.min(HUE_BINS - 1, Math.floor((h / 360) * HUE_BINS))]!;
      // 饱和度越高、明度越居中的像素越可信
      const weight = s * (1 - Math.abs(l - 0.5));
      bin.weight += weight;
      bin.sin += Math.sin((h / 180) * Math.PI) * weight;
      bin.cos += Math.cos((h / 180) * Math.PI) * weight;
      bin.sat += s * weight;
      bin.lig += l * weight;
      bin.count += 1;
    }
  }

  if (!colored) {
    return null;
  }

  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a), bins[0]!);
  if (best.count < 4) {
    return null;
  }

  const hue = ((Math.atan2(best.sin, best.cos) * 180) / Math.PI + 360) % 360;
  const sat = clamp(best.sat / best.weight, 0.45, 0.7);
  const lig = clamp(best.lig / best.weight, 0.42, 0.6);
  return hslToHex(hue, sat, lig);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return rgbToHex(Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255));
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** hex → rgba() 字符串，alpha 0~1。 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 两个颜色按比例混合，ratio 是 b 的占比（0~1）。 */
export function mixHex(a: string, b: string, ratio: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const mix = (sa: number, sb: number) => Math.round(sa * (1 - ratio) + sb * ratio);
  return rgbToHex(
    mix((na >> 16) & 255, (nb >> 16) & 255),
    mix((na >> 8) & 255, (nb >> 8) & 255),
    mix(na & 255, nb & 255),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
