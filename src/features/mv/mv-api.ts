import { pickText, toRecord } from '@/lib/api-parse';
import { mobileApi, bootstrapMobileApi } from '@/lib/kugou-api';

/**
 * 解析 MV 播放地址。video/url 返回以动态 hash 为键的对象，
 * 每个值里带 backupdownurl（数组或字符串）/ downurl。
 */
export async function fetchMvUrl(hash: string): Promise<string | null> {
  await bootstrapMobileApi();
  const response = await mobileApi.video_url({ hash });
  const data = toRecord(toRecord(response.body).data);

  const firstKey = Object.keys(data)[0];
  if (!firstKey) {
    return null;
  }

  const entry = toRecord(data[firstKey]);
  const backup = entry.backupdownurl;
  const backupUrl = Array.isArray(backup) ? pickText(backup[0]) : pickText(backup);
  const url = backupUrl || pickText(entry.downurl);

  return url || null;
}
