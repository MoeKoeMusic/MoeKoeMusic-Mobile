import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

export type UserProfile = {
  userid: string;
  nickname: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  signature: string;
  fans: number;
  follows: number;
  listenMinutes: number;
  isVip: boolean;
  vipLabel: string;
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
    backgroundUrl: sizedImage(pickText(data.bg_pic), 720),
    signature: pickText(data.descri),
    fans: pickNumber(data.fans),
    follows: pickNumber(data.follows),
    listenMinutes: pickNumber(data.duration),
    isVip,
    vipLabel,
  };
}
