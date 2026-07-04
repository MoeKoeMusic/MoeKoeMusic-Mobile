export function sizedImage(url: string | null | undefined, size: number): string | null {
  if (!url || !url.trim()) {
    return null;
  }

  // 保留原始协议：酷狗部分图片 CDN 不支持 HTTPS，明文流量已在 app.json 放行
  return url.includes('{size}') ? url.replaceAll('{size}', String(size)) : url;
}

/** 酷狗接口的时长字段有秒和毫秒两种口径，统一为毫秒。 */
export function normalizeDurationMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed < 10000 ? Math.round(parsed * 1000) : Math.round(parsed);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatPlayCount(value: unknown): string {
  const count =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;

  if (!Number.isFinite(count) || count <= 0) {
    return '';
  }

  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}亿`;
  }

  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }

  return String(count);
}

/** 酷狗的 filename/name 常见格式为“歌手 - 歌名”。 */
export function splitArtistTitle(value: string): { artist: string; title: string } {
  const parts = value.split(' - ');
  if (parts.length < 2) {
    return { artist: '', title: value.trim() };
  }

  return {
    artist: parts[0]?.trim() ?? '',
    title: parts.slice(1).join(' - ').trim(),
  };
}

/** 去掉搜索接口返回文本里的 <em> 高亮标记。 */
export function stripEmTags(value: string): string {
  return value.replace(/<\/?em>/g, '').trim();
}
