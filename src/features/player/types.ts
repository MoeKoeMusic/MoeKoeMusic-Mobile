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
};

export type PlayMode = 'sequence' | 'shuffle' | 'single';

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty';
