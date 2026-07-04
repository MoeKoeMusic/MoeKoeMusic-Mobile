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

const LRC_LINE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(content: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const text = rawLine.replace(LRC_LINE, '').trim();
    LRC_LINE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = LRC_LINE.exec(rawLine)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] ?? '0';
      const fraction = Number(fractionRaw) * (fractionRaw.length === 3 ? 1 : 10);

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        continue;
      }

      if (text) {
        lines.push({ timeMs: minutes * 60000 + seconds * 1000 + fraction, text });
      }
    }
    LRC_LINE.lastIndex = 0;
  }

  return lines
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((line, index, list) => index === 0 || line.timeMs !== list[index - 1].timeMs || line.text !== list[index - 1].text);
}

/** 歌词两段式获取：先按 hash 搜索候选，再下载解码为 LRC。 */
export async function loadLyricLines(track: PlayerTrack): Promise<LyricLine[]> {
  const searchResponse = await mobileApi.search_lyric({
    hash: track.hash,
    album_audio_id: track.albumAudioId ?? 0,
  });

  const candidates = toRecords(toRecord(searchResponse.body).candidates);
  const candidate = candidates[0];
  if (!candidate || !candidate.id || !candidate.accesskey) {
    return [];
  }

  const lyricResponse = await mobileApi.lyric({
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: 'lrc',
    decode: true,
  });

  const content = toRecord(lyricResponse.body).decodeContent;
  if (typeof content !== 'string' || !content.trim()) {
    return [];
  }

  return parseLrc(content);
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
