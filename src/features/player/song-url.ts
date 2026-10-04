import { pickStringLike, pickText, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, stripEmTags } from '@/lib/format';
import { mobileApi } from '@/lib/kugou-api';

import type { PlayerTrack } from './types';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  return [];
}

export class PlaybackUnavailableError extends Error {}

export type ResolvedSongSource = {
  uri: string;
  durationMs: number;
};

type SongUrlArgs = {
  hash: string;
  album_id: string | number;
  album_audio_id: string | number;
};

type SongUrlOutcome = {
  status: number;
  urls: string[];
  timeLength: unknown;
};

async function requestSongUrl(args: SongUrlArgs): Promise<SongUrlOutcome> {
  const response = await mobileApi.song_url({
    hash: args.hash,
    album_id: args.album_id,
    album_audio_id: args.album_audio_id,
    free_part: 1,
  });

  const body = toRecord(response.body);
  return {
    status: Number(body.status ?? 0),
    urls: [
      ...collectUrls(body.url),
      ...collectUrls(body.backupUrl),
      ...collectUrls(body.backup_url),
    ],
    timeLength: body.timeLength,
  };
}

function normalizeTitle(value: string): string {
  return stripEmTags(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 歌单等接口下发的 hash 不一定是可播的标准音源（酷狗 /v5/url 会因此返回 status 3），
 * 取不到链接时用“歌手 + 歌名”重新搜索，换搜索结果里的标准 FileHash 再试一次。
 */
async function findSearchReplacement(track: PlayerTrack): Promise<SongUrlArgs | null> {
  const keyword = track.artist && track.artist !== '未知歌手' ? `${track.artist} ${track.title}` : track.title;
  if (!keyword.trim()) {
    return null;
  }

  try {
    const response = await mobileApi.search({ keywords: keyword, page: 1, pagesize: 10, type: 'song' });
    const records = toRecords(toRecord(toRecord(response.body).data).lists);
    const title = normalizeTitle(track.title);
    const candidates = records
      .map((item) => ({
        hash: pickText(item.FileHash),
        title: pickText(item.OriSongName, item.SongName, item.FileName),
        albumId: pickStringLike(item.AlbumID),
        albumAudioId: pickStringLike(item.MixSongID),
      }))
      .filter((item) => item.hash && normalizeTitle(item.title) === title);
    if (!candidates.length) {
      return null;
    }

    const matched =
      (track.albumAudioId
        ? candidates.find((item) => item.albumAudioId === track.albumAudioId)
        : undefined) ?? candidates[0];
    return { hash: matched.hash, album_id: matched.albumId || 0, album_audio_id: matched.albumAudioId || 0 };
  } catch {
    return null;
  }
}

/** 解析歌曲真实播放地址；无版权/需付费时抛 PlaybackUnavailableError。 */
export async function resolveSongSource(track: PlayerTrack): Promise<ResolvedSongSource> {
  if (track.source === 'cloud') {
    return resolveCloudSource(track);
  }

  let outcome = await requestSongUrl({
    hash: track.hash,
    album_id: track.albumId ?? 0,
    album_audio_id: track.albumAudioId ?? 0,
  });

  if (!outcome.urls.length) {
    const replacement = await findSearchReplacement(track);
    if (replacement) {
      const retried = await requestSongUrl(replacement);
      if (retried.urls.length) {
        outcome = retried;
      }
    }
  }

  if (!outcome.urls.length) {
    if (outcome.status === 3) {
      throw new PlaybackUnavailableError('这首歌暂无版权，无法播放');
    }

    throw new PlaybackUnavailableError('这首歌需要 VIP，暂时无法播放');
  }

  return {
    uri: outcome.urls[0],
    durationMs: normalizeDurationMs(outcome.timeLength) || track.durationMs || 0,
  };
}

/** 云盘歌曲的播放地址走 mcloud 专用接口。 */
async function resolveCloudSource(track: PlayerTrack): Promise<ResolvedSongSource> {
  const response = await mobileApi.user_cloud_url({
    hash: track.hash,
    album_audio_id: track.albumAudioId ?? 0,
    name: track.title,
  });

  const body = toRecord(response.body);
  const data = toRecord(body.data);
  const urls = collectUrls(data.url);

  if (Number(body.status ?? 0) !== 1 || !urls.length) {
    throw new PlaybackUnavailableError('云盘歌曲暂时无法播放');
  }

  return {
    uri: urls[0],
    durationMs: track.durationMs ?? 0,
  };
}
