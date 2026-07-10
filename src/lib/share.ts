import { Share } from 'react-native';

import type { PlayerTrack } from '@/features/player/types';

/** 分享链接口径与桌面版一致(music.moekoe.cn 的 H5 播放页)。 */
export async function shareTrack(track: PlayerTrack): Promise<boolean> {
  const url = `https://music.moekoe.cn/share/?hash=${track.hash}`;
  const message = `分享歌曲《${track.artist} - ${track.title}》,快来听听吧! ${url}`;

  try {
    const result = await Share.share({ message }, { dialogTitle: '分享歌曲' });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
