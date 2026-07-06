import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { TrackCollectionScreen } from '@/components/ui/track-collection-screen';
import { fetchAlbumSongs } from '@/features/discover/discover-api';

export default function AlbumScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    cover?: string;
    artist?: string;
    date?: string;
  }>();
  const albumId = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' && params.name ? params.name : '专辑';
  const cover = typeof params.cover === 'string' && params.cover ? params.cover : null;
  const artist = typeof params.artist === 'string' ? params.artist : '';
  const date = typeof params.date === 'string' ? params.date : '';
  const subtitle = [artist, date].filter(Boolean).join(' · ');

  const loadPage = useCallback((page: number) => fetchAlbumSongs(albumId, page), [albumId]);

  return (
    <TrackCollectionScreen
      collectionKey={albumId}
      title={name}
      subtitle={subtitle}
      coverUrl={cover}
      emptyText="这张专辑暂时没有歌曲"
      loadPage={loadPage}
    />
  );
}
