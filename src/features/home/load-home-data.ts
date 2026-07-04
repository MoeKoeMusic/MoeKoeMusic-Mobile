import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

type UnknownRecord = Record<string, unknown>;

export interface HomeBanner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string | null;
}

export interface HomeKeyword {
  keyword: string;
  reason: string;
}

export interface HomeSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  note: string;
}

export interface HomePlaylist {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  playCountText: string;
  tagText: string;
}

export interface HomeRankSong {
  id: string;
  title: string;
  artist: string;
}

export interface HomeRankCard {
  id: string;
  title: string;
  intro: string;
  coverUrl: string | null;
  songs: HomeRankSong[];
}

export interface HomeData {
  banners: HomeBanner[];
  hotKeywords: HomeKeyword[];
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

function formatError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'body' in error) {
    try {
      return JSON.stringify(error);
    } catch {
      return '接口请求失败';
    }
  }

  return String(error);
}

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function toRecords(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function pickStringLike(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

function parseCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function formatPlayCount(value: unknown) {
  const count = parseCount(value);
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}亿播放`;
  }

  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万播放`;
  }

  if (count > 0) {
    return `${count}次播放`;
  }

  return '精选歌单';
}

function withImageSize(url: string | null, size: number) {
  if (!url) {
    return null;
  }

  return url.includes('{size}') ? url.replaceAll('{size}', String(size)) : url;
}

function splitFilename(filename: string) {
  const parts = filename.split(' - ');
  if (parts.length < 2) {
    return { artist: '', title: '' };
  }

  return {
    artist: parts[0]?.trim() ?? '',
    title: parts.slice(1).join(' - ').trim(),
  };
}

function formatSongNote(note: string) {
  if (/^\d{8}$/.test(note)) {
    return `${note.slice(0, 4)}.${note.slice(4, 6)}.${note.slice(6, 8)}`;
  }

  return note.replaceAll('-', '.');
}

function normalizeSong(record: UnknownRecord): HomeSong | null {
  const filename = pickText(record.filename);
  const parsedFilename = splitFilename(filename);
  const transParam = toRecord(record.trans_param);
  const title = pickText(record.ori_audio_name, record.songname, parsedFilename.title, filename);
  const artist = pickText(record.author_name, parsedFilename.artist, '未知歌手');
  const note = formatSongNote(
    pickText(record.rec_copy_write, record.recommend_reason, record.publish_date)
  );
  const coverUrl = withImageSize(
    pickText(transParam.union_cover, record.sizable_cover, record.album_sizable_cover),
    240
  );

  if (!title) {
    return null;
  }

  return {
    id: pickStringLike(record.hash, record.audio_id, filename, title),
    title,
    artist,
    coverUrl,
    note,
  };
}

function normalizeTagText(tags: unknown) {
  const tagItems = toRecords(tags)
    .map((tag) => pickText(tag.name, tag.tag_name, tag.title))
    .filter(Boolean)
    .slice(0, 2);

  if (tagItems.length) {
    return tagItems.join(' · ');
  }

  if (Array.isArray(tags)) {
    const textTags = tags
      .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      .slice(0, 2);
    if (textTags.length) {
      return textTags.join(' · ');
    }
  }

  return '酷狗官方精选';
}

async function loadSection<T>(label: string, runner: () => Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await runner();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: `${label}加载失败：${formatError(error)}` };
  }
}

export async function loadHomeData(): Promise<HomeData> {
  await bootstrapMobileApi();

  const [bannerSection, hotSection, dailySection, playlistSection, rankSection, newSongSection] =
    await Promise.all([
      loadSection('轮播', async () => {
        const response = await mobileApi.yueku_banner({});
        const body = toRecord(response.body);
        const data = toRecord(body.data);

        return toRecords(data.ads)
          .map<HomeBanner | null>((item) => {
            const extra = toRecord(item.extra);
            const title = pickText(item.title, extra.title);
            const imageUrl = withImageSize(pickText(item.img_url, item.image), 720);

            if (!title && !imageUrl) {
              return null;
            }

            return {
              id: pickStringLike(item.id, title, imageUrl ?? 'banner'),
              title: title || '酷狗音乐精选内容',
              subtitle: pickText(extra.desc, extra.remark, extra.url, '来自酷狗乐库的推荐内容'),
              imageUrl,
              linkUrl: pickText(extra.url) || null,
            };
          })
          .filter((item): item is HomeBanner => Boolean(item))
          .slice(0, 5);
      }),
      loadSection('热搜', async () => {
        const response = await mobileApi.search_hot({});
        const body = toRecord(response.body);
        const data = toRecord(body.data);
        const firstGroup = toRecords(data.list)[0] ?? {};

        return toRecords(firstGroup.keywords)
          .map<HomeKeyword | null>((item) => {
            const keyword = pickText(item.keyword);
            if (!keyword) {
              return null;
            }

            return {
              keyword,
              reason: pickText(item.reason, item.remark, '热搜趋势'),
            };
          })
          .filter((item): item is HomeKeyword => Boolean(item))
          .slice(0, 10);
      }),
      loadSection('每日推荐', async () => {
        const response = await mobileApi.everyday_recommend({ platform: 'ios' });
        const body = toRecord(response.body);
        const data = toRecord(body.data);

        return toRecords(data.song_list)
          .map(normalizeSong)
          .filter((item): item is HomeSong => Boolean(item))
          .slice(0, 6);
      }),
      loadSection('推荐歌单', async () => {
        const response = await mobileApi.top_playlist({
          category_id: 0,
          page: 1,
          pagesize: 6,
          withsong: 0,
        });
        const body = toRecord(response.body);
        const data = toRecord(body.data);

        return toRecords(data.special_list)
          .map<HomePlaylist | null>((item) => {
            const title = pickText(item.specialname);
            if (!title) {
              return null;
            }

            return {
              id: pickStringLike(item.global_collection_id, item.specialid, title),
              title,
              description: pickText(item.intro, item.playlist_intro, '值得循环收藏的歌单'),
              coverUrl: withImageSize(pickText(item.flexible_cover, item.cover), 480),
              playCountText: formatPlayCount(item.play_count),
              tagText: normalizeTagText(item.tags),
            };
          })
          .filter((item): item is HomePlaylist => Boolean(item))
          .slice(0, 6);
      }),
      loadSection('榜单', async () => {
        const response = await mobileApi.rank_list({ withsong: 0 });
        const body = toRecord(response.body);
        const data = toRecord(body.data);
        const baseCards = toRecords(data.info)
          .map((item) => ({
            id: pickStringLike(item.rankid, item.rank_id),
            title: pickText(item.rankname),
            intro: pickText(item.intro, item.remark, '当前平台热度较高的曲目'),
            coverUrl: withImageSize(pickText(item.imgurl, item.img_9, item.banner_9), 480),
          }))
          .filter((item) => Boolean(item.id && item.title))
          .slice(0, 3);

        const details = await Promise.all(
          baseCards.map((card) =>
            loadSection(card.title, async () => {
              const detailResponse = await mobileApi.rank_audio({ pagesize: 3, rankid: card.id });
              const detailBody = toRecord(detailResponse.body);
              const detailData = toRecord(detailBody.data);

              return toRecords(detailData.songlist)
                .map((item) => normalizeSong(item))
                .filter((item): item is HomeSong => Boolean(item))
                .slice(0, 3)
                .map<HomeRankSong>((song) => ({
                  id: song.id,
                  title: song.title,
                  artist: song.artist,
                }));
            })
          )
        );

        return baseCards
          .map<HomeRankCard | null>((card, index) => {
            const songs = details[index]?.data ?? [];
            if (!songs.length) {
              return null;
            }

            return {
              ...card,
              songs,
            };
          })
          .filter((item): item is HomeRankCard => Boolean(item));
      }),
      loadSection('新歌', async () => {
        const response = await mobileApi.top_song({ page: 1, pagesize: 6 });
        const body = toRecord(response.body);
        const data = toRecords(body.data);

        return data.map(normalizeSong).filter((item): item is HomeSong => Boolean(item)).slice(0, 6);
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

  const result: HomeData = {
    banners: bannerSection.data ?? [],
    hotKeywords: hotSection.data ?? [],
    dailySongs: dailySection.data ?? [],
    playlists: playlistSection.data ?? [],
    rankCards: rankSection.data ?? [],
    newSongs: newSongSection.data ?? [],
    issues,
    updatedAt: Date.now(),
  };

  const hasContent = Boolean(
    result.banners.length ||
      result.hotKeywords.length ||
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
