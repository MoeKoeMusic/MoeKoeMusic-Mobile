import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

export type UserProfile = {
  userid: string;
  nickname: string;
  avatarUrl: string | null;
  fans: number;
  follows: number;
  listenMinutes: number;
  isVip: boolean;
  vipLabel: string;
};

export type UserPlaylistItem = {
  gid: string;
  name: string;
  coverUrl: string | null;
  count: number;
  isMine: boolean;
};

export function isLoggedIn(): boolean {
  const session = getApiSession();
  return Boolean(session.userid && session.userid !== '0' && session.token);
}

export async function fetchUserProfile(): Promise<UserProfile> {
  await bootstrapMobileApi();
  const [detailResult, vipResult] = await Promise.allSettled([
    mobileApi.user_detail({}),
    mobileApi.user_vip_detail({}),
  ]);

  if (detailResult.status === 'rejected') {
    throw detailResult.reason instanceof Error
      ? detailResult.reason
      : new Error('获取用户信息失败');
  }

  const data = toRecord(toRecord(detailResult.value.body).data);
  const session = getApiSession();

  let isVip = false;
  let vipLabel = '';
  if (vipResult.status === 'fulfilled') {
    const vipRecords = toRecords(toRecord(toRecord(vipResult.value.body).data).busi_vip);
    const activeVip = vipRecords.find((item) => pickNumber(item.is_vip) === 1);
    if (activeVip) {
      isVip = true;
      vipLabel = pickText(activeVip.product_type).toLowerCase() === 'svip' ? 'SVIP' : 'VIP';
    }
  }

  return {
    userid: pickStringLike(data.userid, session.userid),
    nickname: pickText(data.nickname, `用户 ${session.userid ?? ''}`),
    avatarUrl: sizedImage(pickText(data.pic), 240),
    fans: pickNumber(data.fans),
    follows: pickNumber(data.follows),
    listenMinutes: pickNumber(data.duration),
    isVip,
    vipLabel,
  };
}

export async function fetchUserPlaylists(): Promise<UserPlaylistItem[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.user_playlist({ page: 1, pagesize: 200 });
  const data = toRecord(toRecord(response.body).data);
  const session = getApiSession();
  const myUserid = String(session.userid ?? '');

  return toRecords(data.info)
    .map<UserPlaylistItem | null>((item) => {
      const gid = pickStringLike(item.list_create_gid);
      const name = pickText(item.name);
      // authors 字段存在说明是收藏的专辑，不在歌单列表展示
      if (!gid || !name || item.authors) {
        return null;
      }

      return {
        gid,
        name,
        coverUrl: sizedImage(pickText(item.pic), 240),
        count: pickNumber(item.count),
        isMine: pickStringLike(item.list_create_userid) === myUserid,
      };
    })
    .filter((item): item is UserPlaylistItem => Boolean(item));
}
