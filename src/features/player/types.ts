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
  /** 歌曲在所属歌单里的实例 ID，仅来自歌单曲目接口；从歌单移除歌曲必须用它。 */
  fileid?: string;
  /** 曲目来源；cloud 表示用户云盘上传，播放地址走云盘专用接口。 */
  source?: 'cloud';
};

export type PlayMode = 'sequence' | 'shuffle' | 'single';

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty';
