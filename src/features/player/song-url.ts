import { normalizeDurationMs } from '@/lib/format';
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

/** 解析歌曲真实播放地址；无版权/需付费时抛 PlaybackUnavailableError。 */
export async function resolveSongSource(track: PlayerTrack): Promise<ResolvedSongSource> {
  const response = await mobileApi.song_url({
    hash: track.hash,
    album_id: track.albumId ?? 0,
    album_audio_id: track.albumAudioId ?? 0,
    free_part: 1,
  });

  const body = toRecord(response.body);
  const status = Number(body.status ?? 0);
  const urls = [
    ...collectUrls(body.url),
    ...collectUrls(body.backupUrl),
    ...collectUrls(body.backup_url),
  ];

  if (!urls.length) {
    if (status === 3) {
      throw new PlaybackUnavailableError('这首歌暂无版权，无法播放');
    }

    throw new PlaybackUnavailableError('这首歌需要 VIP，暂时无法播放');
  }

  return {
    uri: urls[0],
    durationMs: normalizeDurationMs(body.timeLength) || track.durationMs || 0,
  };
}
