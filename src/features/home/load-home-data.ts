import { fetchHotKeywords, type SearchKeyword } from '@/features/search/search-api';
import type { PlayerTrack } from '@/features/player/types';
import {
  detectAudioQuality,
  formatApiError,
  pickNumber,
  pickStringLike,
  pickText,
  toRecord,
  toRecords,
} from '@/lib/api-parse';
import { formatPlayCount, normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

export interface HomeBanner {
  id: string;
  title: string;
  imageUrl: string | number | null;
  playlistGid?: string| null;
  linkUrl?: string;
}

const MY_PLAYLIST_BANNER: HomeBanner = {
  id: 'my-playlist',
  title: '阿珏酱的歌单',
  imageUrl: require('@/assets/images/banner.png'),
  playlistGid: 'collection_3_25230245_24_0',
};

function extractLinkUrl(record: Record<string, unknown>): string | undefined {
  const url = pickText(toRecord(record.extra).url, record.url, record.jump_url);
  return /^https?:\/\//.test(url) ? url : undefined;
}

export type HomeSong = PlayerTrack & { note: string };

export interface HomePlaylist {
  gid: string;
  title: string;
  coverUrl: string | null;
  playCountText: string;
}

export interface HomeRankCard {
  id: string;
  title: string;
  coverUrl: string | null;
  songs: PlayerTrack[];
}

export interface HomeData {
  banners: HomeBanner[];
  hotKeywords: SearchKeyword[];
  dailySongs: HomeSong[];
  playlists: HomePlaylist[];
  rankCards: HomeRankCard[];
  newSongs: HomeSong[];
  issues: string[];
  updatedAt: number;
}

type SectionResult<T> = {
  data: T | null;
  error: string | null;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function formatSongNote(note: string) {
  if (/^\d{8}$/.test(note)) {
    return `${note.slice(0, 4)}.${note.slice(4, 6)}.${note.slice(6, 8)}`;
  }

  return note.replaceAll('-', '.');
}

function normalizeSong(record: Record<string, unknown>): HomeSong | null {
  const hash = pickText(record.hash);
  if (!hash) {
    return null;
  }

  const filename = pickText(record.filename);
  const parsedFilename = splitArtistTitle(filename);
  const transParam = toRecord(record.trans_param);
  const title = pickText(record.ori_audio_name, record.songname, parsedFilename.title, filename);
  if (!title) {
    return null;
  }

  return {
    hash,
    title,
    artist: pickText(record.author_name, parsedFilename.artist, '未知歌手'),
    coverUrl: sizedImage(
      pickText(transParam.union_cover, record.sizable_cover, record.album_sizable_cover),
      240
    ),
    albumId: pickStringLike(record.album_id) || undefined,
    albumAudioId: pickStringLike(record.album_audio_id, record.audio_id) || undefined,
    durationMs: normalizeDurationMs(record.time_length ?? record.timelength ?? record.timelen),
    vip: pickNumber(record.privilege) >= 10 || undefined,
    quality: detectAudioQuality(record),
    note: formatSongNote(
      pickText(record.rec_copy_write, record.recommend_reason, record.publish_date)
    ),
  };
}

async function loadSection<T>(label: string, runner: () => Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await runner();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: `${label}加载失败：${formatApiError(error)}` };
  }
}

export async function loadHomeData(): Promise<HomeData> {
  await bootstrapMobileApi();

  const [bannerSection, hotSection, dailySection, playlistSection, rankSection, newSongSection] =
    await Promise.all([
      loadSection('轮播', async () => {
        const response = await mobileApi.yueku_banner({});
        const data = toRecord(toRecord(response.body).data);

        return toRecords(data.ads)
          .map<HomeBanner | null>((item) => {
            const title = pickText(item.title, toRecord(item.extra).title);
            const imageUrl = sizedImage(pickText(item.img_url, item.image), 720);
            if (!imageUrl) {
              return null;
            }

            return {
              id: pickStringLike(item.id) || imageUrl,
              title: title || '酷狗精选',
              imageUrl,
              playlistGid: null,
              linkUrl: extractLinkUrl(item),
            };
          })
          .filter((item): item is HomeBanner => Boolean(item))
          .slice(0, 6);
      }),
      loadSection('热搜', fetchHotKeywords),
      loadSection('每日推荐', async () => {
        const response = await mobileApi.everyday_recommend({ platform: 'ios' });
        const data = toRecord(toRecord(response.body).data);

        const songs = toRecords(data.song_list)
          .map(normalizeSong)
          .filter((item): item is HomeSong => Boolean(item));
        return shuffle(songs).slice(0, 24);
      }),
      loadSection('推荐歌单', async () => {
        const response = await mobileApi.top_playlist({
          category_id: 0,
          page: 1,
          pagesize: 6,
          withsong: 0,
        });
        const data = toRecord(toRecord(response.body).data);

        return toRecords(data.special_list)
          .map<HomePlaylist | null>((item) => {
            const title = pickText(item.specialname);
            const gid = pickStringLike(item.global_collection_id);
            if (!title || !gid) {
              return null;
            }

            return {
              gid,
              title,
              coverUrl: sizedImage(pickText(item.flexible_cover, item.cover), 480),
              playCountText: formatPlayCount(item.play_count),
            };
          })
          .filter((item): item is HomePlaylist => Boolean(item))
          .slice(0, 6);
      }),
      loadSection('榜单', async () => {
        const response = await mobileApi.rank_list({ withsong: 0 });
        const data = toRecord(toRecord(response.body).data);
        const baseCards = toRecords(data.info)
          .map((item) => ({
            id: pickStringLike(item.rankid, item.rank_id),
            title: pickText(item.rankname),
            coverUrl: sizedImage(pickText(item.imgurl, item.img_9, item.banner_9), 480),
          }))
          .filter((item) => Boolean(item.id && item.title))
          .slice(0, 3);

        const details = await Promise.all(
          baseCards.map((card) =>
            loadSection(card.title, async () => {
              const detailResponse = await mobileApi.rank_audio({ pagesize: 3, rankid: card.id });
              const detailData = toRecord(toRecord(detailResponse.body).data);

              return toRecords(detailData.songlist)
                .map(normalizeSong)
                .filter((item): item is HomeSong => Boolean(item))
                .slice(0, 3);
            })
          )
        );

        return baseCards
          .map<HomeRankCard | null>((card, index) => {
            const songs = details[index]?.data ?? [];
            if (!songs.length) {
              return null;
            }

            return { ...card, songs };
          })
          .filter((item): item is HomeRankCard => Boolean(item));
      }),
      loadSection('新歌', async () => {
        const response = await mobileApi.top_song({ page: 1, pagesize: 6 });
        const data = toRecords(toRecord(response.body).data);

        return data
          .map(normalizeSong)
          .filter((item): item is HomeSong => Boolean(item))
          .slice(0, 6);
      }),
    ]);

  const issues = [
    bannerSection.error,
    hotSection.error,
    dailySection.error,
    playlistSection.error,
    rankSection.error,
    newSongSection.error,
  ].filter((item): item is string => Boolean(item));

  const apiBanners = bannerSection.data ?? [];
  const result: HomeData = {
    banners: [MY_PLAYLIST_BANNER, ...apiBanners],
    hotKeywords: hotSection.data ?? [],
    dailySongs: dailySection.data ?? [],
    playlists: playlistSection.data ?? [],
    rankCards: rankSection.data ?? [],
    newSongs: newSongSection.data ?? [],
    issues,
    updatedAt: Date.now(),
  };

  // 固定轮播不算内容,避免全部接口失败时误判为加载成功
  const hasContent = Boolean(
    apiBanners.length ||
      result.dailySongs.length ||
      result.playlists.length ||
      result.rankCards.length ||
      result.newSongs.length
  );

  if (!hasContent) {
    throw new Error(issues[0] ?? '首页数据加载失败');
  }

  return result;
}
