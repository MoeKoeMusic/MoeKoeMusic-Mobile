import { mobileApi } from '@/lib/kugou-api';

import type { LyricLine, PlayerTrack } from './types';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function toRecords(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
}

const KRC_LINE = /^\[(\d+),\d+\](.*)$/;
const KRC_WORD = /<\d+,\d+,\d+>/g;

export function parseKrc(content: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.match(KRC_LINE);
    if (!match) {
      continue;
    }

    const timeMs = Number(match[1]);
    const text = match[2].replace(KRC_WORD, '').trim();
    if (Number.isFinite(timeMs) && text) {
      lines.push({ timeMs, text });
    }
  }

  return lines
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((line, index, list) => index === 0 || line.timeMs !== list[index - 1].timeMs || line.text !== list[index - 1].text);
}

/** 与桌面端一致：按 hash 搜索首个候选，再下载解码 KRC。 */
export async function loadLyricLines(track: PlayerTrack): Promise<LyricLine[]> {
  const searchResponse = await mobileApi.search_lyric({ hash: track.hash });
  if (searchResponse.status !== 200) {
    throw new Error('歌词搜索失败');
  }

  const candidate = toRecords(toRecord(searchResponse.body).candidates)[0];
  if (!candidate?.id || !candidate.accesskey) {
    return [];
  }

  const lyricResponse = await mobileApi.lyric({
    id: String(candidate.id),
    accesskey: String(candidate.accesskey),
    fmt: 'krc',
    decode: true,
  });
  const content = toRecord(lyricResponse.body).decodeContent;
  if (lyricResponse.status !== 200 || typeof content !== 'string') {
    throw new Error('歌词获取失败');
  }

  return parseKrc(content);
}

export function findActiveLyricIndex(lines: LyricLine[], positionMs: number): number {
  if (!lines.length) {
    return -1;
  }

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].timeMs <= positionMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}
