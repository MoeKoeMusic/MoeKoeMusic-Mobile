import type { PlayerTrack } from '@/features/player/types';
import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

export const CLOUD_PAGE_SIZE = 50;

export type CloudStorage = {
  usedBytes: number;
  maxBytes: number;
};

export type CloudTracksPage = {
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
  storage: CloudStorage | null;
};

export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)}${units[exponent]}`;
}

function mapCloudTrack(item: Record<string, unknown>): PlayerTrack | null {
  const hash = pickText(item.hash);
  if (!hash) {
    return null;
  }

  // 无标签的上传文件只有 filename（"歌手 - 歌名.mp3"），尽力拆出歌手和歌名
  const filename = pickText(item.filename).replace(/\.[a-zA-Z0-9]{2,5}$/, '');
  const fromFilename = splitArtistTitle(filename);
  const title = pickText(item.name) || fromFilename.title || '未知歌曲';
  const artist = pickText(item.author_name) || fromFilename.artist || '云盘音乐';

  const albumInfo = toRecord(item.album_info);
  const firstAuthor = toRecords(item.authors)[0] ?? {};

  return {
    hash,
    title,
    artist,
    album: pickText(item.album_name) || undefined,
    coverUrl: sizedImage(pickText(albumInfo.sizable_cover, firstAuthor.sizable_avatar), 240),
    durationMs: normalizeDurationMs(item.timelen) || undefined,
    albumAudioId: pickStringLike(item.album_audio_id) || undefined,
    source: 'cloud',
  };
}

/** 拉取云盘歌曲列表；首页会带上存储空间信息。 */
export async function fetchCloudTracks(page: number): Promise<CloudTracksPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.user_cloud({ page, pagesize: CLOUD_PAGE_SIZE });

  const body = toRecord(response.body);
  if (pickNumber(body.status) !== 1) {
    throw new Error(pickText(body.error_msg, body.error) || '云盘加载失败');
  }

  const data = toRecord(body.data);
  const list = toRecords(Array.isArray(data.list) ? data.list : data.info);
  const tracks = list
    .map(mapCloudTrack)
    .filter((track): track is PlayerTrack => Boolean(track));

  const total = pickNumber(data.list_count);
  const maxBytes = pickNumber(data.max_size);
  const usedBytes = pickNumber(data.used_size);

  return {
    tracks,
    total,
    hasMore: total > 0 ? page * CLOUD_PAGE_SIZE < total : tracks.length >= CLOUD_PAGE_SIZE,
    storage: maxBytes > 0 ? { usedBytes, maxBytes } : null,
  };
}
