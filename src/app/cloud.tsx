import { useCallback, useState } from 'react';

import { TrackCollectionScreen } from '@/components/ui/track-collection-screen';
import {
  fetchCloudTracks,
  formatStorageSize,
  type CloudStorage,
} from '@/features/cloud/cloud-api';

export default function CloudScreen() {
  const [storage, setStorage] = useState<CloudStorage | null>(null);

  const loadPage = useCallback(async (page: number) => {
    const result = await fetchCloudTracks(page);
    if (result.storage) {
      setStorage(result.storage);
    }
    return {
      tracks: result.tracks,
      hasMore: result.hasMore,
      total: result.total,
    };
  }, []);

  const subtitle = storage
    ? `已用 ${formatStorageSize(storage.usedBytes)} / ${formatStorageSize(storage.maxBytes)}`
    : '上传到酷狗云盘的音乐';

  return (
    <TrackCollectionScreen
      collectionKey="cloud"
      title="我的云盘"
      subtitle={subtitle}
      coverUrl={null}
      coverIcon="cloud"
      emptyText="云盘里还没有歌曲"
      loadPage={loadPage}
    />
  );
}
