import { useSyncExternalStore } from 'react';

import { isLoggedIn } from '@/features/account/user-api';
import type { PlayerTrack } from '@/features/player/types';
import { bootstrapMobileApi } from '@/lib/kugou-api';
import {
  addTracksToPlaylist,
  createPlaylist,
  fetchLibraryPlaylists,
  fetchPlaylistTrackRefs,
  removeTracksFromPlaylist,
  type LibraryPlaylist,
} from './library-api';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type LibraryState = {
  status: LibraryStatus;
  playlists: LibraryPlaylist[];
  /** 已喜欢歌曲 hash -> 在"我喜欢"歌单里的 fileid('' 表示刚加入、fileid 待后台刷新)。 */
  liked: Record<string, string>;
  likedReady: boolean;
  error: string;
};

const INITIAL_STATE: LibraryState = {
  status: 'idle',
  playlists: [],
  liked: {},
  likedReady: false,
  error: '',
};

let state = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(partial: Partial<LibraryState>) {
  state = { ...state, ...partial };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getLikePlaylist(): LibraryPlaylist | null {
  return state.playlists.find((item) => item.isLike) ?? null;
}

function bumpCount(listid: string, delta: number) {
  setState({
    playlists: state.playlists.map((item) =>
      item.listid === listid ? { ...item, count: Math.max(0, item.count + delta) } : item
    ),
  });
}

let refreshPromise: Promise<void> | null = null;
let likedPromise: Promise<void> | null = null;

async function refreshLikedMap(): Promise<void> {
  if (!likedPromise) {
    likedPromise = (async () => {
      const like = getLikePlaylist();
      if (!like) {
        setState({ liked: {}, likedReady: true });
        return;
      }

      const refs = await fetchPlaylistTrackRefs(like.gid);
      const liked: Record<string, string> = {};
      for (const ref of refs) {
        liked[ref.hash] = ref.fileid;
      }
      setState({ liked, likedReady: true });
    })().finally(() => {
      likedPromise = null;
    });
  }

  return likedPromise;
}

async function refreshLibrary(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // 登录态存在 session 里,读取前先确保水合完成
      await bootstrapMobileApi();
      if (!isLoggedIn()) {
        setState({ ...INITIAL_STATE });
        return;
      }

      setState({ status: state.status === 'ready' ? 'ready' : 'loading', error: '' });
      try {
        const playlists = await fetchLibraryPlaylists();
        setState({ status: 'ready', playlists, error: '' });
        void refreshLikedMap().catch(() => undefined);
      } catch (error) {
        setState({
          status: state.status === 'ready' ? 'ready' : 'error',
          error: error instanceof Error ? error.message : '歌单加载失败',
        });
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function ensureLibrary(): Promise<void> {
  if (state.status === 'ready') {
    return;
  }
  await refreshLibrary();
}

async function ensureLikedReady(): Promise<void> {
  await ensureLibrary();
  if (!state.likedReady) {
    await refreshLikedMap();
  }
}

export const libraryActions = {
  refresh: refreshLibrary,
  ensure: ensureLibrary,

  reset() {
    setState({ ...INITIAL_STATE });
  },

  /** 加入/移出"我喜欢"。未登录或没有"我喜欢"歌单时抛错。 */
  async toggleLike(track: PlayerTrack): Promise<'liked' | 'unliked'> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    await ensureLikedReady();
    const like = getLikePlaylist();
    if (!like) {
      throw new Error('没有找到"我喜欢"歌单');
    }

    const existing = state.liked[track.hash];
    if (existing !== undefined) {
      let fileid = existing;
      if (!fileid) {
        // 刚加入还没拿到 fileid，强制刷新一次映射
        await refreshLikedMap();
        fileid = state.liked[track.hash] ?? '';
      }
      if (!fileid) {
        throw new Error('暂时无法移出，请稍后再试');
      }

      await removeTracksFromPlaylist(like.listid, [fileid]);
      const liked = { ...state.liked };
      delete liked[track.hash];
      setState({ liked });
      bumpCount(like.listid, -1);
      return 'unliked';
    }

    await addTracksToPlaylist(like.listid, [track]);
    setState({ liked: { ...state.liked, [track.hash]: '' } });
    bumpCount(like.listid, 1);
    // 后台补拉真实 fileid，供后续"取消喜欢"使用
    void refreshLikedMap().catch(() => undefined);
    return 'liked';
  },

  /** 收藏歌曲到指定歌单。 */
  async addToPlaylist(playlist: LibraryPlaylist, tracks: PlayerTrack[]): Promise<void> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    await addTracksToPlaylist(playlist.listid, tracks);
    bumpCount(playlist.listid, tracks.length);
    if (playlist.isLike) {
      const liked = { ...state.liked };
      for (const track of tracks) {
        if (liked[track.hash] === undefined) {
          liked[track.hash] = '';
        }
      }
      setState({ liked });
      void refreshLikedMap().catch(() => undefined);
    }
  },

  /** 从歌单移除歌曲(需要 track.fileid)。 */
  async removeFromPlaylist(listid: string, tracks: PlayerTrack[]): Promise<void> {
    const fileids = tracks
      .map((track) => track.fileid)
      .filter((fileid): fileid is string => Boolean(fileid));
    if (!fileids.length) {
      throw new Error('缺少歌曲信息，无法移除');
    }

    await removeTracksFromPlaylist(listid, fileids);
    bumpCount(listid, -fileids.length);

    const like = getLikePlaylist();
    if (like?.listid === listid) {
      const liked = { ...state.liked };
      for (const track of tracks) {
        delete liked[track.hash];
      }
      setState({ liked });
    }
  },

  /** 创建歌单并刷新列表，返回新歌单 listid。 */
  async createPlaylist(name: string): Promise<string> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    const listid = await createPlaylist(name);
    await refreshLibrary();
    return listid;
  },
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL_STATE);
}

export function useIsLiked(hash: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hash ? state.liked[hash] !== undefined : false),
    () => false
  );
}

export type { LibraryPlaylist };
