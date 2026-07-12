import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { TrackCollectionScreen } from '@/components/ui/track-collection-screen';
import { fetchArtistSongs } from '@/features/artist/artist-api';

export default function ArtistScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    avatar?: string;
  }>();
  const artistId = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' && params.name ? params.name : '歌手';
  const avatar = typeof params.avatar === 'string' && params.avatar ? params.avatar : null;

  const loadPage = useCallback((page: number) => fetchArtistSongs(artistId, page), [artistId]);

  return (
    <TrackCollectionScreen
      collectionKey={artistId}
      title={name}
      coverUrl={avatar}
      circleCover
      emptyText="这位歌手暂时没有歌曲"
      loadPage={loadPage}
    />
  );
}
