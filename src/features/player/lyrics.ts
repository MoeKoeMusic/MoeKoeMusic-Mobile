import { Buffer } from 'buffer';

import { pickStringLike, pickText } from '@/lib/api-parse';
import { artistMatches, stripEmTags } from '@/lib/format';
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

/** 增强 KRC（酷狗新格式，常见于外国歌）：[start,dur]<wStart,wDur,0>word… */
const KRC_E_LINE_TAG = /^\[(-?\d+),(\d+)\]/;
const KRC_E_WORD = /<(\d+),(\d+),\d+>([^<]*)/g;

type ParsedKrc = {
  lines: LyricLine[];
  /** 每行在原始时间轴里的序号，用于和翻译数组对位。 */
  rawIndexes: number[];
  /** 原始时间轴总行数（含被跳过的空行/元数据行）。 */
  rawCount: number;
};

/**
 * 提取 KRC 内嵌的翻译数据：[language:<base64 JSON>]，
 * JSON.content[0].lyricContent[i][0] 即第 i 行时间轴的翻译（空串表示无翻译）。
 */
function extractKrcTranslations(content: string): string[] | null {
  const match = content.match(/\[language:([^\]]+)\]/);
  if (!match) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    const contentArr = (parsed as UnknownRecord).content;
    const content0 = toRecord(Array.isArray(contentArr) ? contentArr[0] : null);
    const lyricContent = content0.lyricContent;
    if (!Array.isArray(lyricContent)) {
      return null;
    }

    return lyricContent.map((entry) =>
      Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : ''
    );
  } catch {
    return null;
  }
}

/** 行序一致才对位翻译；不一致时宁可不给翻译也不错位。 */
function applyTranslations(parsed: ParsedKrc, translations: string[] | null): LyricLine[] {
  if (!translations || translations.length !== parsed.rawCount) {
    return parsed.lines;
  }

  return parsed.lines.map((line, index) => {
    const translation = decodeEntities(translations[parsed.rawIndexes[index]] ?? '').trim();
    return translation ? { ...line, translation } : line;
  });
}

/** 解析 KRC 为逐字行；自动识别旧 XML 与新增强 LRC 两种格式，并携带行级翻译。 */
export function parseKrc(content: string): LyricLine[] {
  const translations = extractKrcTranslations(content);

  const xml = parseKrcXml(content);
  if (xml.lines.length) {
    return applyTranslations(xml, translations);
  }

  const enhanced = parseKrcEnhanced(content);
  if (enhanced.lines.length) {
    return applyTranslations(enhanced, translations);
  }

  return [];
}

/** 旧格式：XML KRC。每个 word 时间为相对行首的偏移，换算成绝对时间。 */
function parseKrcXml(content: string): ParsedKrc {
  const lines: LyricLine[] = [];
  const rawIndexes: number[] = [];
  let rawCount = 0;

  for (const match of content.matchAll(KRC_LINE)) {
    const rawIndex = rawCount;
    rawCount += 1;
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
    rawIndexes.push(rawIndex);
  }

  const deduped = lines
    .map((line, index) => ({ line, rawIndex: rawIndexes[index] }))
    .sort((a, b) => a.line.timeMs - b.line.timeMs)
    .filter(
      (item, index, list) => index === 0 || item.line.timeMs !== list[index - 1].line.timeMs
    );

  return {
    lines: deduped.map((item) => item.line),
    rawIndexes: deduped.map((item) => item.rawIndex),
    rawCount,
  };
}

/** 新格式：增强 LRC，行内嵌逐字时间轴 [start,dur]<wStart,wDur,0>word… */
function parseKrcEnhanced(content: string): ParsedKrc {
  const entries: { line: LyricLine; rawIndex: number }[] = [];
  let rawCount = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const tag = KRC_E_LINE_TAG.exec(rawLine);
    if (!tag) {
      continue;
    }

    const rawIndex = rawCount;
    rawCount += 1;
    const start = Number(tag[1]);
    const duration = Number(tag[2]);
    const words: LyricWord[] = [];

    for (const wordMatch of rawLine.matchAll(KRC_E_WORD)) {
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

    const text = words
      .map((word) => word.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || !words.length) {
      continue;
    }

    entries.push({ line: { timeMs: start, durationMs: duration, text, words }, rawIndex });
  }

  const deduped = entries
    .sort((a, b) => a.line.timeMs - b.line.timeMs)
    .filter(
      (item, index, list) => index === 0 || item.line.timeMs !== list[index - 1].line.timeMs
    );

  return {
    lines: deduped.map((item) => item.line),
    rawIndexes: deduped.map((item) => item.rawIndex),
    rawCount,
  };
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
 * 优先 KRC（逐字时间轴 + 内嵌翻译），拿不到 KRC 或解析失败时回退行级 LRC。
 * 结果按 hash 做内存缓存（含去重），切歌回来不再重复请求。
 */
const lyricCache = new Map<string, Promise<LyricLine[]>>();
const MAX_LYRIC_CACHE = 24;

export function loadLyricLines(track: PlayerTrack): Promise<LyricLine[]> {
  const key = track.hash;
  const cached = lyricCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = fetchLyricLines(track).finally(() => {
    // 只缓存最终结果，失败允许下次重试
    if (lyricCache.get(key) === pending && lyricCache.size > MAX_LYRIC_CACHE) {
      lyricCache.delete(key);
    }
  });
  lyricCache.set(key, pending);
  return pending;
}

async function fetchLyricLines(track: PlayerTrack): Promise<LyricLine[]> {
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
  if (typeof decodeContent === 'string') {
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
 * 每一步都校验候选的歌手/歌名与当前曲目一致：hash 认不出时酷狗会按关键词模糊返回，
 * 同名资源（如同名有声书）的歌词会被混进来。
 */
async function findLyricCandidate(track: PlayerTrack): Promise<UnknownRecord | null> {
  // 前两级（hash+album_audio_id 与仅 hash）互相独立，并行发出省一次往返
  const [withAlbum, hashOnly] = await Promise.all([
    track.albumAudioId
      ? tryPickCandidate({ hash: track.hash, album_audio_id: track.albumAudioId }, track)
      : Promise.resolve(null),
    tryPickCandidate({ hash: track.hash }, track),
  ]);

  if (withAlbum || hashOnly) {
    return withAlbum ?? hashOnly;
  }

  for (const replacement of await findLyricHashViaSearch(track)) {
    const candidate = pickCandidate(await searchLyricCandidates(replacement), track);
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
      }),
      track
    );
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/** tryPickCandidate：搜索失败（网络/接口报错）按无候选处理，不打断兜底链。 */
async function tryPickCandidate(args: LyricSearchArgs, track: PlayerTrack): Promise<UnknownRecord | null> {
  try {
    return pickCandidate(await searchLyricCandidates(args), track);
  } catch {
    return null;
  }
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
    const durationSec = track.durationMs ? Math.round(track.durationMs / 1000) : 0;
    return records
      .map((item) => ({
        hash: pickText(item.FileHash),
        title: pickText(item.OriSongName, item.SongName, item.FileName),
        artist: pickText(item.Singername, item.SingerName),
        durationSec: Number(item.Duration) || 0,
        albumAudioId: pickStringLike(item.MixSongID),
      }))
      .filter(
        (item) =>
          item.hash &&
          normalizeTitle(item.title) === title &&
          // 同名资源（如同名有声书）也会命中歌名，按歌手过滤后再换 hash。
          (!track.artist || track.artist === '未知歌手' || artistMatches(item.artist, track.artist))
      )
      .sort((a, b) => Math.abs((a.durationSec || durationSec) - durationSec) - Math.abs((b.durationSec || durationSec) - durationSec))
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

/**
 * 从候选里挑第一个有 id/accesskey 且身份对得上的：
 * 候选自带 song/singer 字段，与当前曲目明显不符（比如同名有声书）时跳过；
 * 候选没有身份字段时只能照旧取第一个。
 */
function pickCandidate(candidates: UnknownRecord[], track: PlayerTrack): UnknownRecord | null {
  const usable = candidates.filter((candidate) => candidate.id && candidate.accesskey);
  if (!usable.length) {
    return null;
  }

  const identified = usable.filter((candidate) => pickText(candidate.song) && pickText(candidate.singer));
  const matched = identified.find((candidate) => candidateMatches(candidate, track));
  if (matched) {
    return matched;
  }

  // 候选都带身份但全对不上：宁可没歌词也不能给错的。
  if (identified.length) {
    return null;
  }

  return usable[0];
}

function candidateMatches(candidate: UnknownRecord, track: PlayerTrack): boolean {
  const candidateTitle = normalizeTitle(pickText(candidate.song));
  const trackTitle = normalizeTitle(track.title);
  const titleMatched =
    candidateTitle === trackTitle || candidateTitle.includes(trackTitle) || trackTitle.includes(candidateTitle);

  const candidateArtist = pickText(candidate.singer);
  const artistMatched = !track.artist || track.artist === '未知歌手' || artistMatches(candidateArtist, track.artist);

  return titleMatched && artistMatched;
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
