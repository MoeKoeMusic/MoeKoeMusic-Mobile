import type { PlayerTrack } from '@/features/player/types';
import { detectAudioQuality, pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

export type PlaylistInfo = {
  name: string;
  intro: string;
  coverUrl: string | null;
  count: number;
};

export type PlaylistTracksPage = {
  info: PlaylistInfo | null;
  tracks: PlayerTrack[];
  hasMore: boolean;
};

export const PLAYLIST_PAGE_SIZE = 50;

export async function fetchPlaylistTracks(
  globalCollectionId: string,
  page: number
): Promise<PlaylistTracksPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_track_all({
    id: globalCollectionId,
    page,
    pagesize: PLAYLIST_PAGE_SIZE,
  });

  const data = toRecord(toRecord(response.body).data);
  const listInfo = toRecord(data.list_info);
  const count = pickNumber(data.count, listInfo.count);

  const name = pickText(listInfo.name);
  const info: PlaylistInfo | null = name || count > 0
    ? {
        name,
        intro: pickText(listInfo.intro),
        coverUrl: sizedImage(pickText(listInfo.pic), 480),
        count,
      }
    : null;

  const songs = toRecords(data.songs);
  const tracks = songs
    .map<PlayerTrack | null>((item) => {
      const hash = pickText(item.hash);
      const rawName = pickText(item.name);
      if (!hash || !rawName) {
        return null;
      }

      const { artist, title } = splitArtistTitle(rawName);
      const albumInfo = toRecord(item.albuminfo);

      return {
        hash,
        title,
        artist: artist || '未知歌手',
        album: pickText(albumInfo.name) || undefined,
        coverUrl: sizedImage(pickText(item.cover), 240),
        albumId: pickStringLike(item.album_id) || undefined,
        albumAudioId: pickStringLike(item.album_audio_id, item.audio_id, item.mixsongid) || undefined,
        durationMs: normalizeDurationMs(item.timelen),
        vip: pickNumber(item.privilege) >= 10 || undefined,
        quality: detectAudioQuality(item),
        fileid: pickStringLike(item.fileid) || undefined,
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  return {
    info,
    tracks,
    hasMore:
      count > 0
        ? songs.length >= PLAYLIST_PAGE_SIZE && page * PLAYLIST_PAGE_SIZE < count
        : songs.length >= PLAYLIST_PAGE_SIZE,
  };
}
