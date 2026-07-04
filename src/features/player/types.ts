export type PlayerTrack = {
  /** 播放用音频 hash，全流程主键。 */
  hash: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl: string | null;
  albumId?: string;
  albumAudioId?: string;
  durationMs?: number;
  vip?: boolean;
  /** 可用最高音质：sq=无损，hq=320k；缺省为普通音质。 */
  quality?: 'sq' | 'hq';
};

export type PlayMode = 'sequence' | 'shuffle' | 'single';

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty';
