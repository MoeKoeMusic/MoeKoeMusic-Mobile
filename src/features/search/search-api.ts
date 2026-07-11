import type { PlayerTrack } from '@/features/player/types';
import { detectAudioQuality, pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { formatPlayCount, normalizeDurationMs, sizedImage, stripEmTags } from '@/lib/format';
import { mobileApi, bootstrapMobileApi } from '@/lib/kugou-api';

export type SearchKeyword = {
  keyword: string;
  reason: string;
};

/** 搜索结果类型，与桌面端搜索页的标签保持一致（MV/综合暂未在移动端实现）。 */
export type SearchTab = 'song' | 'special' | 'album' | 'author';

export type SearchSongsPage = {
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
};

export type SearchPlaylist = {
  id: string;
  name: string;
  creator: string;
  coverUrl: string | null;
  songCount: number;
  playCountText: string;
};

export type SearchAlbum = {
  id: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  songCount: number;
  publishDate: string;
};

export type SearchArtist = {
  id: string;
  name: string;
  avatarUrl: string | null;
  albumCount: number;
  songCount: number;
};

export type SearchListPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

const SEARCH_PAGE_SIZE = 30;

function computeHasMore(total: number, page: number, received: number): boolean {
  return total > 0 ? page * SEARCH_PAGE_SIZE < total : received === SEARCH_PAGE_SIZE;
}

async function searchLists(keywords: string, page: number, type: SearchTab) {
  await bootstrapMobileApi();
  const response = await mobileApi.search({
    keywords,
    page,
    pagesize: SEARCH_PAGE_SIZE,
    type,
  });

  const data = toRecord(toRecord(response.body).data);
  return { records: toRecords(data.lists), total: pickNumber(data.total) };
}

export async function searchSongs(keywords: string, page: number): Promise<SearchSongsPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.search({
    keywords,
    page,
    pagesize: SEARCH_PAGE_SIZE,
    type: 'song',
  });

  const data = toRecord(toRecord(response.body).data);
  const tracks = toRecords(data.lists)
    .map<PlayerTrack | null>((item) => {
      const hash = pickText(item.FileHash);
      const title = stripEmTags(pickText(item.OriSongName, item.SongName));
      if (!hash || !title) {
        return null;
      }

      return {
        hash,
        title,
        artist: stripEmTags(pickText(item.SingerName, '未知歌手')),
        album: stripEmTags(pickText(item.AlbumName)) || undefined,
        coverUrl: sizedImage(pickText(item.Image), 240),
        albumId: pickStringLike(item.AlbumID) || undefined,
        albumAudioId: pickStringLike(item.MixSongID) || undefined,
        durationMs: normalizeDurationMs(item.Duration),
        vip: pickNumber(item.Privilege) >= 10 || undefined,
        quality: detectAudioQuality(item),
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  const total = pickNumber(data.total);
  return {
    tracks,
    total,
    hasMore: total > 0 ? page * SEARCH_PAGE_SIZE < total : tracks.length === SEARCH_PAGE_SIZE,
  };
}

export async function searchPlaylists(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchPlaylist>> {
  const { records, total } = await searchLists(keywords, page, 'special');
  const items = records
    .map<SearchPlaylist | null>((item) => {
      const id = pickStringLike(item.gid, item.global_collection_id);
      const name = stripEmTags(pickText(item.specialname));
      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        creator: stripEmTags(pickText(item.nickname, item.username)) || '未知用户',
        coverUrl: sizedImage(pickText(item.img, item.imgurl), 240),
        songCount: pickNumber(item.song_count, item.songcount),
        playCountText: formatPlayCount(item.play_count),
      };
    })
    .filter((item): item is SearchPlaylist => Boolean(item));

  return { items, total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchAlbums(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchAlbum>> {
  const { records, total } = await searchLists(keywords, page, 'album');
  const items = records
    .map<SearchAlbum | null>((item) => {
      const id = pickStringLike(item.albumid);
      const name = stripEmTags(pickText(item.albumname));
      if (!id || !name) {
        return null;
      }

      const artist = toRecords(item.singers)
        .map((singer) => pickText(singer.name))
        .filter(Boolean)
        .join('、');

      return {
        id,
        name,
        artist: stripEmTags(artist || pickText(item.singername)) || '未知歌手',
        coverUrl: sizedImage(pickText(item.img, item.imgurl), 240),
        songCount: pickNumber(item.songcount),
        publishDate: pickText(item.publish_time).split(' ')[0],
      };
    })
    .filter((item): item is SearchAlbum => Boolean(item));

  return { items, total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchArtists(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchArtist>> {
  const { records, total } = await searchLists(keywords, page, 'author');
  const items = records
    .map<SearchArtist | null>((item) => {
      const id = pickStringLike(item.AuthorId, item.SingerId);
      const name = stripEmTags(pickText(item.AuthorName, item.SingerName));
      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        avatarUrl: sizedImage(pickText(item.Avatar, item.Image), 240),
        albumCount: pickNumber(item.AlbumCount),
        songCount: pickNumber(item.AudioCount),
      };
    })
    .filter((item): item is SearchArtist => Boolean(item));

  return { items, total, hasMore: computeHasMore(total, page, records.length) };
}

export async function fetchHotKeywords(): Promise<SearchKeyword[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.search_hot({});
  const data = toRecord(toRecord(response.body).data);
  const firstGroup = toRecords(data.list)[0] ?? {};

  return toRecords(firstGroup.keywords)
    .map<SearchKeyword | null>((item) => {
      const keyword = pickText(item.keyword);
      if (!keyword) {
        return null;
      }

      return {
        keyword,
        reason: pickText(item.reason),
      };
    })
    .filter((item): item is SearchKeyword => Boolean(item))
    .slice(0, 12);
}

export async function fetchSuggestions(keywords: string): Promise<string[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.search_suggest({ keywords });
  const groups = toRecords(toRecord(response.body).data);
  const records = toRecords(groups[0]?.RecordDatas);

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const record of records) {
    const hint = pickText(record.HintInfo);
    if (hint && !seen.has(hint)) {
      seen.add(hint);
      suggestions.push(hint);
    }
  }

  return suggestions.slice(0, 8);
}
