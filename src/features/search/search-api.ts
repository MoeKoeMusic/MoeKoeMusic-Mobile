import type { PlayerTrack } from '@/features/player/types';
import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, stripEmTags } from '@/lib/format';
import { mobileApi, bootstrapMobileApi } from '@/lib/kugou-api';

export type SearchKeyword = {
  keyword: string;
  reason: string;
};

export type SearchSongsPage = {
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
};

const SEARCH_PAGE_SIZE = 30;

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
