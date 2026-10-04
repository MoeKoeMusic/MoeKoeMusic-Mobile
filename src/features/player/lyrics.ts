import { pickStringLike, pickText } from '@/lib/api-parse';
import { stripEmTags } from '@/lib/format';
import { mobileApi } from '@/lib/kugou-api';

import type { LyricLine, LyricWord, PlayerTrack } from './types';

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

/** KRC 的每一行：<line start="123" dur="456"><word start="123" dur="45">字</word>…</line> */
const KRC_LINE = /<line start="(\d+)" dur="(\d+)"[^>]*>([\s\S]*?)<\/line>/g;
const KRC_WORD = /<word start="(\d+)" dur="(\d+)"[^>]*>([\s\S]*?)<\/word>/g;
const KRC_LINE_TEXT_TAG = /<[^>]+>/g;

/** 解析 KRC XML 为逐字行；每个 word 时间为相对行首的偏移，换算成绝对时间。 */
export function parseKrc(content: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const match of content.matchAll(KRC_LINE)) {
    const start = Number(match[1]);
    const duration = Number(match[2]);
    const body = match[3] ?? '';
    const words: LyricWord[] = [];

    for (const wordMatch of body.matchAll(KRC_WORD)) {
      const text = decodeEntities(wordMatch[3] ?? '');
      if (!text) {
        continue;
      }
      words.push({
        timeMs: start + Number(wordMatch[1]),
        durationMs: Number(wordMatch[2]),
        text,
      });
    }

    const text = decodeEntities(body.replace(KRC_LINE_TEXT_TAG, '')).trim();
    if (!text || !words.length) {
      continue;
    }

    lines.push({ timeMs: start, durationMs: duration, text, words });
  }

  return lines
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((line, index, list) => index === 0 || line.timeMs !== list[index - 1].timeMs);
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

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

/**
 * 歌词两段式获取：先按 hash 搜索候选，再下载解码。
 * 优先 KRC（逐字时间轴，供卡拉OK式渲染），拿不到 KRC 或解析失败时回退行级 LRC。
 */
export async function loadLyricLines(track: PlayerTrack): Promise<LyricLine[]> {
  const candidate = await findLyricCandidate(track);
  if (!candidate) {
    return [];
  }

  const lyricResponse = await mobileApi.lyric({
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: 'krc',
    decode: true,
  });

  const body = toRecord(lyricResponse.body);
  const decodeContent = body.decodeContent;
  if (typeof decodeContent === 'string' && decodeContent.includes('<word ')) {
    const krcLines = parseKrc(decodeContent);
    if (krcLines.length) {
      return krcLines;
    }
  }

  // 回退：请求行级 LRC（部分歌曲只有 LRC，或 KRC 内容不完整）。
  const lrcResponse = await mobileApi.lyric({
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: 'lrc',
    decode: true,
  });
  const lrcContent = toRecord(lrcResponse.body).decodeContent;
  if (typeof lrcContent !== 'string' || !lrcContent.trim()) {
    return [];
  }

  return parseLrc(lrcContent);
}

type LyricSearchArgs = {
  hash: string;
  album_audio_id?: string | number;
  keywords?: string;
  duration?: number;
};

/**
 * 搜索歌词候选，逐级兜底：
 * 1. hash + album_audio_id（快且精准，但酷狗会校验两者一致性，收藏歌曲读回的 id 可能对不上）；
 * 2. 仅 hash（hash 本身可唯一定位歌词）；
 * 3. 歌词库认不出当前 hash 时（收藏读回的 hash 可能不是标准音源），用歌名搜索换标准 FileHash 再搜；
 * 4. 「歌手 + 歌名」关键词。
 */
async function findLyricCandidate(track: PlayerTrack): Promise<UnknownRecord | null> {
  if (track.albumAudioId) {
    const candidate = pickCandidate(await searchLyricCandidates({ hash: track.hash, album_audio_id: track.albumAudioId }));
    if (candidate) {
      return candidate;
    }
  }

  const hashOnly = pickCandidate(await searchLyricCandidates({ hash: track.hash }));
  if (hashOnly) {
    return hashOnly;
  }

  for (const replacement of await findLyricHashViaSearch(track)) {
    const candidate = pickCandidate(await searchLyricCandidates(replacement));
    if (candidate) {
      return candidate;
    }
  }

  const keyword = track.artist && track.artist !== '未知歌手' ? `${track.artist} ${track.title}` : track.title;
  if (keyword.trim()) {
    const candidate = pickCandidate(
      await searchLyricCandidates({
        hash: track.hash,
        keywords: keyword,
        duration: track.durationMs ? Math.round(track.durationMs / 1000) * 1000 : 0,
      })
    );
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/** 按歌名搜索歌曲，返回标准音源 hash 供歌词搜索兜底。 */
async function findLyricHashViaSearch(track: PlayerTrack): Promise<LyricSearchArgs[]> {
  const keyword = track.artist && track.artist !== '未知歌手' ? `${track.artist} ${track.title}` : track.title;
  if (!keyword.trim()) {
    return [];
  }

  try {
    const response = await mobileApi.search({ keywords: keyword, page: 1, pagesize: 10, type: 'song' });
    const records = toRecords(toRecord(toRecord(response.body).data).lists);
    const title = normalizeTitle(track.title);
    return records
      .map((item) => ({
        hash: pickText(item.FileHash),
        title: pickText(item.OriSongName, item.SongName, item.FileName),
        albumAudioId: pickStringLike(item.MixSongID),
      }))
      .filter((item) => item.hash && normalizeTitle(item.title) === title)
      .slice(0, 3)
      .map((item) => ({ hash: item.hash, album_audio_id: item.albumAudioId || 0 }));
  } catch {
    return [];
  }
}

function normalizeTitle(value: string): string {
  return stripEmTags(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchLyricCandidates(params: LyricSearchArgs) {
  return mobileApi.search_lyric(params).then((response) => toRecords(toRecord(response.body).candidates));
}

function pickCandidate(candidates: UnknownRecord[]): UnknownRecord | null {
  const candidate = candidates[0];
  if (!candidate || !candidate.id || !candidate.accesskey) {
    return null;
  }
  return candidate;
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
