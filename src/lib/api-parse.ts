type UnknownRecord = Record<string, unknown>;

export function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

export function toRecords(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
}

export function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function pickStringLike(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      return String(value);
    }
  }

  return '';
}

export function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

export function formatApiError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

/**
 * 判断歌曲可用最高音质。酷狗不同接口的口径不同：
 * 歌单/推荐类带 relate_goods（长度 >2 含无损、>1 含 320k），
 * 搜索类用 SQFileHash / HQFileHash 字段。
 */
export function detectAudioQuality(
  record: Record<string, unknown>
): 'sq' | 'hq' | undefined {
  const goodsCount = Array.isArray(record.relate_goods) ? record.relate_goods.length : 0;

  if (goodsCount > 2 || pickText(record.SQFileHash, record.sqhash, record.hash_flac)) {
    return 'sq';
  }

  if (goodsCount > 1 || pickText(record.HQFileHash, record.hash_320)) {
    return 'hq';
  }

  return undefined;
}
