import type { PlayerTrack } from '@/features/player/types';
import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

export type LibraryPlaylist = {
  /** 写操作(加歌/删歌/删歌单)用的 ID。 */
  listid: string;
  /** 读操作(拉曲目/路由跳转)用的全局 ID。 */
  gid: string;
  name: string;
  coverUrl: string | null;
  count: number;
  isMine: boolean;
  isLike: boolean;
};

export const LIKE_PLAYLIST_NAME = '我喜欢';

function ensureOk(body: unknown, fallbackMessage: string): Record<string, unknown> {
  const record = toRecord(body);
  if (pickNumber(record.status) !== 1) {
    throw new Error(pickText(record.error_msg, record.error) || fallbackMessage);
  }
  return record;
}

export async function fetchLibraryPlaylists(): Promise<LibraryPlaylist[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.user_playlist({ page: 1, pagesize: 200 });
  const data = toRecord(toRecord(response.body).data);
  const myUserid = String(getApiSession().userid ?? '');

  return toRecords(data.info)
    .map<LibraryPlaylist | null>((item) => {
      const listid = pickStringLike(item.listid);
      const gid = pickStringLike(item.list_create_gid);
      const name = pickText(item.name);
      // authors 字段存在说明是收藏的专辑，不算歌单
      if (!listid || !gid || !name || item.authors) {
        return null;
      }

      return {
        listid,
        gid,
        name,
        coverUrl: sizedImage(pickText(item.pic), 240),
        count: pickNumber(item.count),
        isMine: pickStringLike(item.list_create_userid) === myUserid,
        isLike: name === LIKE_PLAYLIST_NAME,
      };
    })
    .filter((item): item is LibraryPlaylist => Boolean(item));
}

/** 创建歌单，返回新歌单的 listid。 */
export async function createPlaylist(name: string): Promise<string> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_add({
    name,
    list_create_userid: getApiSession().userid,
  });
  const body = ensureOk(response.body, '创建歌单失败');
  return pickStringLike(toRecord(toRecord(body.data).info).listid);
}

/**
 * 收藏歌曲到歌单。data 串按 `,`/`|` 拆分，
 * 所以歌名里的这两个分隔符必须剔除；直调模块不要再 URL 编码。
 */
export async function addTracksToPlaylist(listid: string, tracks: PlayerTrack[]): Promise<void> {
  await bootstrapMobileApi();
  const data = tracks
    .map((track) => {
      const name = `${track.artist} - ${track.title}`.replace(/[,|]/g, ' ');
      return [name, track.hash, track.albumId ?? '', track.albumAudioId ?? ''].join('|');
    })
    .join(',');

  const response = await mobileApi.playlist_tracks_add({ listid, data });
  ensureOk(response.body, '收藏失败');
}

/** 从歌单移除歌曲；fileid 来自歌单曲目接口，与 hash 不是一回事。 */
export async function removeTracksFromPlaylist(listid: string, fileids: string[]): Promise<void> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_tracks_del({ listid, fileids: fileids.join(',') });
  ensureOk(response.body, '移除失败');
}

export type PlaylistTrackRef = {
  hash: string;
  fileid: string;
};

const TRACK_REF_PAGE_SIZE = 300;
const TRACK_REF_MAX_PAGES = 4;

/**
 * 拉取歌单全部曲目的 hash/fileid 轻量映射(用于"我喜欢"状态判定与取消喜欢)。
 * 上限 TRACK_REF_MAX_PAGES 页，超大歌单尾部不保证覆盖。
 */
export async function fetchPlaylistTrackRefs(gid: string): Promise<PlaylistTrackRef[]> {
  await bootstrapMobileApi();
  const refs: PlaylistTrackRef[] = [];

  for (let page = 1; page <= TRACK_REF_MAX_PAGES; page += 1) {
    const response = await mobileApi.playlist_track_all({
      id: gid,
      page,
      pagesize: TRACK_REF_PAGE_SIZE,
    });
    const data = toRecord(toRecord(response.body).data);
    const songs = toRecords(data.songs);

    for (const item of songs) {
      const hash = pickText(item.hash);
      const fileid = pickStringLike(item.fileid);
      if (hash && fileid) {
        refs.push({ hash, fileid });
      }
    }

    const total = pickNumber(toRecord(data.list_info).count);
    const fetched = page * TRACK_REF_PAGE_SIZE;
    if (songs.length < TRACK_REF_PAGE_SIZE || (total > 0 && fetched >= total)) {
      break;
    }
  }

  return refs;
}
