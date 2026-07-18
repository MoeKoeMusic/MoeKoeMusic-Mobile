import { isCurrentQueueGeneration, playerActions } from './store';
import type { PlayerTrack } from './types';

type CollectionPage = {
  tracks: PlayerTrack[];
  hasMore: boolean;
};

type PlayCollectionOptions = {
  /** 列表当前已加载出来的曲目（第 1..loadedPage 页）。 */
  tracks: PlayerTrack[];
  /** 起始播放下标（相对 tracks），缺省从头播。 */
  startIndex?: number;
  /** tracks 覆盖到的最后一页页码。 */
  loadedPage: number;
  /** 是否还有后续分页。 */
  hasMore: boolean;
  /** 按页拉取曲目，与列表分页共用同一口径（同 pagesize、同排序）。 */
  loadPage: (page: number) => Promise<CollectionPage>;
};

// 后台补齐的兜底上限，防止接口 hasMore 口径异常时无限翻页；
// 80 页 × 50 首/页 = 4000 首，已超出酷狗歌单容量上限。
const MAX_FILL_PAGES = 80;

let fillToken = 0;

/**
 * 播放“分页集合”（歌单/榜单/专辑/云盘）：先用已加载的曲目立刻开播，
 * 再在后台把剩余分页拉全并追加到播放队列，使“播放全部”是真正的全部曲目。
 * 顺序与列表一致；用户中途另起新队列（播别的歌单/插播/清空）时自动停止补齐。
 */
export async function playCollection(options: PlayCollectionOptions): Promise<void> {
  const { tracks, startIndex = 0, loadedPage, hasMore, loadPage } = options;

  const generation = await playerActions.playTracks(tracks, startIndex);
  if (generation === null || !hasMore) {
    return;
  }

  const token = ++fillToken;
  void fillRemaining({ generation, token, seedTracks: tracks, loadedPage, loadPage });
}

async function fillRemaining(options: {
  generation: number;
  token: number;
  seedTracks: PlayerTrack[];
  loadedPage: number;
  loadPage: (page: number) => Promise<CollectionPage>;
}): Promise<void> {
  const { generation, token, seedTracks, loadedPage, loadPage } = options;

  // 记录已入队过的 hash：既防接口窗口重叠，也保证用户手动从队列移除的歌不会被补齐重新加回。
  const seen = new Set(seedTracks.map((track) => track.hash));
  let page = loadedPage;
  let fetched = 0;
  let dryPages = 0;

  while (fetched < MAX_FILL_PAGES) {
    // 队列已被替换/清空（播了别的集合、清空队列）时立即停止补齐。
    if (token !== fillToken || !isCurrentQueueGeneration(generation)) {
      return;
    }

    page += 1;
    fetched += 1;

    let result: CollectionPage;
    try {
      result = await loadPage(page);
    } catch {
      // 失败静默重试一次，再失败就放弃补齐：不打断当前播放，队列保持已有部分。
      try {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (token !== fillToken || !isCurrentQueueGeneration(generation)) {
          return;
        }
        result = await loadPage(page);
      } catch {
        return;
      }
    }

    if (!result.tracks.length) {
      return;
    }

    const fresh = result.tracks.filter((track) => track.hash && !seen.has(track.hash));
    for (const track of fresh) {
      seen.add(track.hash);
    }

    if (fresh.length) {
      dryPages = 0;
      if (!playerActions.appendTracks(fresh, generation)) {
        return;
      }
    } else {
      // 连续两页没有任何新曲目，视为接口在重复返回旧数据，停止补齐。
      dryPages += 1;
      if (dryPages >= 2) {
        return;
      }
    }

    if (!result.hasMore) {
      return;
    }
  }
}
