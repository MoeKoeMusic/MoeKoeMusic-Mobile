import type { PlayerTrack } from '@/features/player/types';
import { detectAudioQuality, pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { formatPlayCount, normalizeDurationMs, sizedImage, stripEmTags } from '@/lib/format';
import { mobileApi, bootstrapMobileApi } from '@/lib/kugou-api';

export type SearchKeyword = {
  keyword: string;
  reason: string;
};

/** 搜索标签，与桌面端搜索页保持一致：综合/单曲/歌单/专辑/MV/歌手。 */
export type SearchTab = 'complex' | 'song' | 'special' | 'album' | 'mv' | 'author';

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

export type SearchMv = {
  hash: string;
  name: string;
  singer: string;
  coverUrl: string | null;
  durationMs: number;
};

export type SearchListPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

/** 综合搜索结果：每个分区带条目和总数，供“查看更多”跳转对应标签。 */
export type ComplexSearchResult = {
  artists: SearchArtist[];
  songs: PlayerTrack[];
  songsTotal: number;
  albums: SearchAlbum[];
  albumsTotal: number;
  playlists: SearchPlaylist[];
  playlistsTotal: number;
  mvs: SearchMv[];
  mvsTotal: number;
};

const SEARCH_PAGE_SIZE = 30;

function computeHasMore(total: number, page: number, received: number): boolean {
  return total > 0 ? page * SEARCH_PAGE_SIZE < total : received === SEARCH_PAGE_SIZE;
}

/* ---------- 各类型的字段映射，分类型搜索与综合搜索共用 ---------- */

function mapSongRecord(item: Record<string, unknown>): PlayerTrack | null {
  const hash = pickText(item.FileHash);
  const title = stripEmTags(pickText(item.OriSongName, item.SongName, item.FileName));
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
}

function mapPlaylistRecord(item: Record<string, unknown>): SearchPlaylist | null {
  const id = pickStringLike(item.gid, item.global_collection_id);
  const name = stripEmTags(pickText(item.specialname));
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    creator: stripEmTags(pickText(item.nickname, item.username)) || '未知用户',
    coverUrl: sizedImage(pickText(item.img, item.imgurl), 480),
    songCount: pickNumber(item.song_count, item.songcount),
    playCountText: formatPlayCount(item.play_count),
  };
}

function mapAlbumRecord(item: Record<string, unknown>): SearchAlbum | null {
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
    coverUrl: sizedImage(pickText(item.img, item.imgurl), 480),
    songCount: pickNumber(item.songcount),
    publishDate: pickText(item.publish_time).split(' ')[0],
  };
}

function mapArtistRecord(item: Record<string, unknown>): SearchArtist | null {
  const id = pickStringLike(item.AuthorId, item.SingerId);
  const name = stripEmTags(pickText(item.AuthorName, item.SingerName));
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    avatarUrl: sizedImage(pickText(item.Avatar, item.Image), 480),
    albumCount: pickNumber(item.AlbumCount),
    songCount: pickNumber(item.AudioCount),
  };
}

/** 酷狗 MV 封面既有完整 URL，也有形如“20240101xxx.jpg”的裸文件名，需要拼接 CDN。 */
function resolveMvCover(url: string, size: number): string | null {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//.test(url)) {
    return url.replaceAll('{size}', String(size));
  }
  if (/^\d{8,}\.[a-zA-Z0-9]+$/.test(url)) {
    return `https://imge.kugou.com/mvhdpic/${size}/${url.slice(0, 8)}/${url}`;
  }
  if (url.startsWith('/')) {
    return `https://imge.kugou.com${url}`.replaceAll('{size}', String(size));
  }
  return url.replaceAll('{size}', String(size));
}

function mapMvRecord(item: Record<string, unknown>): SearchMv | null {
  const hash = pickText(item.MvHash, item.FileHash);
  const name = stripEmTags(pickText(item.MvName, item.FileName));
  if (!hash || !name) {
    return null;
  }

  const rawDuration = pickNumber(item.Duration);
  return {
    hash,
    name,
    singer: stripEmTags(pickText(item.SingerName)) || '未知歌手',
    coverUrl: resolveMvCover(pickText(item.Pic, item.ErectPic), 480),
    durationMs: rawDuration > 1000 ? rawDuration : rawDuration * 1000,
  };
}

function mapAll<T>(records: Record<string, unknown>[], mapper: (item: Record<string, unknown>) => T | null): T[] {
  return records.map(mapper).filter((item): item is T => Boolean(item));
}

/* ---------- 分类型搜索 ---------- */

async function searchLists(keywords: string, page: number, type: Exclude<SearchTab, 'complex'>) {
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
  const { records, total } = await searchLists(keywords, page, 'song');
  const tracks = mapAll(records, mapSongRecord);
  return { tracks, total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchPlaylists(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchPlaylist>> {
  const { records, total } = await searchLists(keywords, page, 'special');
  return { items: mapAll(records, mapPlaylistRecord), total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchAlbums(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchAlbum>> {
  const { records, total } = await searchLists(keywords, page, 'album');
  return { items: mapAll(records, mapAlbumRecord), total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchArtists(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchArtist>> {
  const { records, total } = await searchLists(keywords, page, 'author');
  return { items: mapAll(records, mapArtistRecord), total, hasMore: computeHasMore(total, page, records.length) };
}

export async function searchMvs(
  keywords: string,
  page: number
): Promise<SearchListPage<SearchMv>> {
  const { records, total } = await searchLists(keywords, page, 'mv');
  return { items: mapAll(records, mapMvRecord), total, hasMore: computeHasMore(total, page, records.length) };
}

/* ---------- 综合搜索 ---------- */

export async function searchComplex(keywords: string): Promise<ComplexSearchResult> {
  await bootstrapMobileApi();
  const response = await mobileApi.search_complex({ keywords });
  const sections = toRecords(toRecord(toRecord(response.body).data).lists);

  const result: ComplexSearchResult = {
    artists: [],
    songs: [],
    songsTotal: 0,
    albums: [],
    albumsTotal: 0,
    playlists: [],
    playlistsTotal: 0,
    mvs: [],
    mvsTotal: 0,
  };

  for (const section of sections) {
    const type = pickText(section.type);
    const lists = toRecords(section.lists);
    const total = pickNumber(section.total);
    if (!lists.length) {
      continue;
    }

    if (type === 'author') {
      result.artists = mapAll(lists, mapArtistRecord);
    } else if (type === 'song') {
      result.songs = mapAll(lists, mapSongRecord);
      result.songsTotal = total || result.songs.length;
    } else if (type === 'album') {
      result.albums = mapAll(lists, mapAlbumRecord);
      result.albumsTotal = total || result.albums.length;
    } else if (type === 'collect') {
      result.playlists = mapAll(lists, mapPlaylistRecord);
      result.playlistsTotal = total || result.playlists.length;
    } else if (type === 'mv') {
      result.mvs = mapAll(lists, mapMvRecord);
      result.mvsTotal = total || result.mvs.length;
    }
  }

  return result;
}

/* ---------- 热搜 / 搜索建议 ---------- */

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
