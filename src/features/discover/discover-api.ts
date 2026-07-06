import type { PlayerTrack } from '@/features/player/types';
import {
  detectAudioQuality,
  pickNumber,
  pickStringLike,
  pickText,
  toRecord,
  toRecords,
} from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

export type DiscoverCategory = {
  tagId: number;
  name: string;
  sons: { tagId: number; name: string }[];
};

export type DiscoverPlaylist = {
  id: string;
  title: string;
  coverUrl: string | null;
  playCountText: string;
};

export type RankGroup = {
  id: string;
  name: string;
  intro: string;
  coverUrl: string | null;
};

export type AlbumRegion = 'chn' | 'eur' | 'jpn' | 'kor';

export type DiscoverAlbum = {
  id: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  publishDate: string;
  songCount: number;
  region: AlbumRegion;
};

export const DISCOVER_PAGE_SIZE = 30;

/** 歌单分类（playlist_tags），首项固定为“推荐”（category_id 0）。 */
export async function fetchPlaylistCategories(): Promise<DiscoverCategory[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_tags({});
  const data = toRecords(toRecord(response.body).data);

  const categories = data
    .map<DiscoverCategory | null>((item) => {
      const name = pickText(item.tag_name);
      const tagId = pickNumber(item.tag_id);
      if (!name) {
        return null;
      }

      return {
        tagId,
        name,
        sons: toRecords(item.son)
          .map((son) => ({
            tagId: pickNumber(son.tag_id),
            name: pickText(son.tag_name),
          }))
          .filter((son) => son.name && son.tagId > 0),
      };
    })
    .filter((item): item is DiscoverCategory => Boolean(item));

  return [{ tagId: 0, name: '推荐', sons: [] }, ...categories];
}

function formatPlayCountShort(value: unknown): string {
  const count = pickNumber(value);
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}亿`;
  }

  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }

  return count > 0 ? String(count) : '';
}

/** 按分类拉取歌单（top_playlist）。 */
export async function fetchCategoryPlaylists(
  tagId: number,
  page: number
): Promise<{ playlists: DiscoverPlaylist[]; hasMore: boolean }> {
  await bootstrapMobileApi();
  const response = await mobileApi.top_playlist({
    category_id: tagId,
    page,
    pagesize: DISCOVER_PAGE_SIZE,
    withsong: 0,
  });

  const data = toRecord(toRecord(response.body).data);
  const playlists = toRecords(data.special_list)
    .map<DiscoverPlaylist | null>((item) => {
      const title = pickText(item.specialname);
      const id = pickStringLike(item.global_collection_id, item.specialid);
      if (!title || !id) {
        return null;
      }

      return {
        id,
        title,
        coverUrl: sizedImage(pickText(item.flexible_cover, item.cover, item.imgurl), 480),
        playCountText: formatPlayCountShort(item.play_count),
      };
    })
    .filter((item): item is DiscoverPlaylist => Boolean(item));

  return {
    playlists,
    hasMore: playlists.length >= DISCOVER_PAGE_SIZE,
  };
}

/** 全部音乐榜单（rank_list）。 */
export async function fetchRankGroups(): Promise<RankGroup[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.rank_list({});
  const data = toRecord(toRecord(response.body).data);

  return toRecords(data.info)
    .map<RankGroup | null>((item) => {
      const id = pickStringLike(item.rankid, item.rank_id);
      const name = pickText(item.rankname);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        intro: pickText(item.intro, item.remark).replace(/\s+/g, ' '),
        coverUrl: sizedImage(pickText(item.imgurl, item.img_9, item.banner_9), 480),
      };
    })
    .filter((item): item is RankGroup => Boolean(item));
}

/** 榜单/新歌接口的曲目结构（含 deprecated 兜底字段）。 */
function normalizeDiscoverSong(record: Record<string, unknown>): PlayerTrack | null {
  const deprecated = toRecord(record.deprecated);
  const transParam = toRecord(record.trans_param);
  const filename = pickText(record.filename);
  const parsed = splitArtistTitle(filename);

  const hash = pickText(record.hash, deprecated.hash);
  const title = pickText(record.ori_audio_name, record.songname, parsed.title, filename);
  if (!hash || !title) {
    return null;
  }

  return {
    hash,
    title,
    artist: pickText(record.author_name, parsed.artist, '未知歌手'),
    album: pickText(record.album_name, record.remark) || undefined,
    coverUrl: sizedImage(
      pickText(transParam.union_cover, record.sizable_cover, record.album_sizable_cover),
      240
    ),
    albumId: pickStringLike(record.album_id) || undefined,
    albumAudioId: pickStringLike(record.album_audio_id, record.audio_id, record.mixsongid) || undefined,
    durationMs: normalizeDurationMs(
      record.duration ?? deprecated.duration ?? record.timelength ?? record.timelen
    ),
    vip: pickNumber(record.privilege, deprecated.pay_type) >= 10 || undefined,
    quality: detectAudioQuality(record),
  };
}

/** 榜单歌曲（rank_audio，分页）。 */
export async function fetchRankSongs(
  rankId: string,
  page: number
): Promise<{ tracks: PlayerTrack[]; hasMore: boolean }> {
  await bootstrapMobileApi();
  const response = await mobileApi.rank_audio({
    rankid: rankId,
    page,
    pagesize: DISCOVER_PAGE_SIZE,
  });

  const data = toRecord(toRecord(response.body).data);
  const tracks = toRecords(data.songlist)
    .map(normalizeDiscoverSong)
    .filter((item): item is PlayerTrack => Boolean(item));

  return {
    tracks,
    hasMore: tracks.length >= DISCOVER_PAGE_SIZE,
  };
}

function normalizePublishDate(value: unknown): string {
  const text = pickText(value);
  return text.split(' ')[0] ?? '';
}

/** 新碟上架（top_album），一次返回华语/欧美/日本/韩国四个地区。 */
export async function fetchNewAlbums(): Promise<DiscoverAlbum[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.top_album({});
  const data = toRecord(toRecord(response.body).data);
  const regions: AlbumRegion[] = ['chn', 'eur', 'jpn', 'kor'];

  return regions.flatMap((region) =>
    toRecords(data[region])
      .map<DiscoverAlbum | null>((item) => {
        const id = pickStringLike(item.albumid, item.album_id);
        const name = pickText(item.albumname, item.album_name);
        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          artist: pickText(item.singername, item.author_name, '未知歌手'),
          coverUrl: sizedImage(pickText(item.imgurl, item.img, item.sizable_cover), 480),
          publishDate: normalizePublishDate(item.publishtime ?? item.publish_time),
          songCount: pickNumber(item.songcount),
          region,
        };
      })
      .filter((item): item is DiscoverAlbum => Boolean(item))
  );
}

/** 新歌速递（top_song，分页）。 */
export async function fetchNewSongs(
  page: number
): Promise<{ tracks: PlayerTrack[]; hasMore: boolean; total: number }> {
  await bootstrapMobileApi();
  const response = await mobileApi.top_song({ page, pagesize: DISCOVER_PAGE_SIZE });
  const body = toRecord(response.body);
  const tracks = toRecords(body.data)
    .map(normalizeDiscoverSong)
    .filter((item): item is PlayerTrack => Boolean(item));

  const total = pickNumber(body.total);

  return {
    tracks,
    total,
    hasMore: total > 0 ? page * DISCOVER_PAGE_SIZE < total : tracks.length >= DISCOVER_PAGE_SIZE,
  };
}

export type AlbumSongsPage = {
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
};

/** 专辑歌曲（album_songs，字段嵌套在 audio_info/base/album_info 里）。 */
export async function fetchAlbumSongs(albumId: string, page: number): Promise<AlbumSongsPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.album_songs({
    id: albumId,
    page,
    pagesize: DISCOVER_PAGE_SIZE,
  });

  const data = toRecord(toRecord(response.body).data);
  const tracks = toRecords(data.songs)
    .map<PlayerTrack | null>((item) => {
      const audioInfo = toRecord(item.audio_info);
      const base = toRecord(item.base);
      const albumInfo = toRecord(item.album_info);
      const transParam = toRecord(item.trans_param);
      const copyright = toRecord(item.copyright);

      const hash = pickText(audioInfo.hash);
      const title = pickText(base.audio_name);
      if (!hash || !title) {
        return null;
      }

      return {
        hash,
        title,
        artist: pickText(base.author_name, '未知歌手'),
        album: pickText(albumInfo.album_name) || undefined,
        coverUrl: sizedImage(pickText(transParam.union_cover, albumInfo.sizable_cover), 240),
        albumId: pickStringLike(albumInfo.album_id) || undefined,
        albumAudioId: pickStringLike(base.album_audio_id, base.audio_id) || undefined,
        durationMs: normalizeDurationMs(audioInfo.duration),
        vip: pickNumber(copyright.privilege) >= 10 || undefined,
        quality: pickText(audioInfo.hash_flac)
          ? 'sq'
          : pickText(audioInfo.hash_320)
            ? 'hq'
            : undefined,
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  const total = pickNumber(data.total);

  return {
    tracks,
    total,
    hasMore: total > 0 ? page * DISCOVER_PAGE_SIZE < total : tracks.length >= DISCOVER_PAGE_SIZE,
  };
}
