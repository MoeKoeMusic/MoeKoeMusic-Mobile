import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { TrackCollectionScreen } from '@/components/ui/track-collection-screen';
import { fetchRankSongs } from '@/features/discover/discover-api';

export default function RankScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; cover?: string }>();
  const rankId = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' && params.name ? params.name : '音乐榜单';
  const cover = typeof params.cover === 'string' && params.cover ? params.cover : null;

  const loadPage = useCallback((page: number) => fetchRankSongs(rankId, page), [rankId]);

  return (
    <TrackCollectionScreen
      collectionKey={rankId}
      title={name}
      coverUrl={cover}
      showRank
      emptyText="这个榜单暂时没有歌曲"
      loadPage={loadPage}
    />
  );
}
