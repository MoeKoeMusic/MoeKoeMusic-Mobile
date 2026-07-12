import type { PlayerTrack } from '@/features/player/types';
import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage } from '@/lib/format';
import { mobileApi, bootstrapMobileApi } from '@/lib/kugou-api';

export type ArtistInfo = {
  name: string;
  avatarUrl: string | null;
  intro: string;
  songCount: number;
  albumCount: number;
  mvCount: number;
  fansCount: number;
};

export type ArtistSongsPage = {
  info: ArtistInfo | null;
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
};

const ARTIST_PAGE_SIZE = 30;

export async function fetchArtistDetail(artistId: string): Promise<ArtistInfo | null> {
  await bootstrapMobileApi();
  const response = await mobileApi.artist_detail({ id: artistId });
  const data = toRecord(toRecord(response.body).data);
  const name = pickText(data.author_name, data.singername);
  if (!name) {
    return null;
  }

  return {
    name,
    avatarUrl: sizedImage(pickText(data.sizable_avatar, data.avatar, data.imgurl), 480),
    intro: pickText(data.intro, data.description),
    songCount: pickNumber(data.song_count, data.audio_count),
    albumCount: pickNumber(data.album_count),
    mvCount: pickNumber(data.mv_count),
    fansCount: pickNumber(data.fansnums, data.fans_count),
  };
}

export async function fetchArtistSongs(
  artistId: string,
  page: number,
  sort: 'hot' | 'new' = 'hot'
): Promise<ArtistSongsPage> {
  await bootstrapMobileApi();
  const [info, response] = await Promise.all([
    page === 1 ? fetchArtistDetail(artistId).catch(() => null) : Promise.resolve(null),
    mobileApi.artist_audios({
      id: artistId,
      sort,
      page,
      pagesize: ARTIST_PAGE_SIZE,
    }),
  ]);

  const rawSongs = toRecords(toRecord(response.body).data);
  const tracks = rawSongs
    .map<PlayerTrack | null>((item) => {
      const hash = pickText(item.hash);
      const title = pickText(item.audio_name, item.songname);
      if (!hash || !title) {
        return null;
      }

      const transParam = toRecord(item.trans_param);

      return {
        hash,
        title,
        artist: pickText(item.author_name, '未知歌手'),
        album: pickText(item.album_name) || undefined,
        coverUrl: sizedImage(pickText(transParam.union_cover, item.cover), 240),
        albumId: pickStringLike(item.album_id) || undefined,
        albumAudioId: pickStringLike(item.album_audio_id, item.audio_id, item.mixsongid) || undefined,
        durationMs: normalizeDurationMs(item.timelength ?? item.duration),
        vip: pickNumber(item.privilege) >= 10 || undefined,
        quality: pickText(item.hash_flac) ? 'sq' : pickText(item.hash_320) ? 'hq' : undefined,
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  const total = info?.songCount ?? 0;
  return {
    info,
    tracks,
    total,
    hasMore: rawSongs.length >= ARTIST_PAGE_SIZE,
  };
}
