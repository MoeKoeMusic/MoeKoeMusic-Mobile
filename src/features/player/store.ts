import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioLockScreenOptions,
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { useSyncExternalStore } from 'react';

import { sizedImage } from '@/lib/format';

import { settingsActions, type QualityId } from '@/features/settings/store';

import { loadLyricLines } from './lyrics';
import { resolveSongSource } from './song-url';
import type { LyricLine, LyricsStatus, PlayMode, PlayerTrack } from './types';

export type PlayerState = {
  queue: PlayerTrack[];
  index: number;
  track: PlayerTrack | null;
  playing: boolean;
  buffering: boolean;
  loading: boolean;
  mode: PlayMode;
  error: string;
  lyrics: LyricLine[];
  lyricsStatus: LyricsStatus;
};

export type ProgressState = {
  positionMs: number;
  durationMs: number;
  /** 是否在播放中；歌词逐字动画用它判断是否在 tick 之间外推位置。 */
  playing: boolean;
  /** 最近一次 positionMs 更新的本地时间戳；逐字动画用它做帧间线性插值。 */
  positionUpdatedAt: number;
};

const INITIAL_PLAYER_STATE: PlayerState = {
  queue: [],
  index: -1,
  track: null,
  playing: false,
  buffering: false,
  loading: false,
  mode: 'sequence',
  error: '',
  lyrics: [],
  lyricsStatus: 'idle',
};

const INITIAL_PROGRESS_STATE: ProgressState = {
  positionMs: 0,
  durationMs: 0,
  playing: false,
  positionUpdatedAt: 0,
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const playerStore = createStore(INITIAL_PLAYER_STATE);
const progressStore = createStore(INITIAL_PROGRESS_STATE);

let audioPlayer: AudioPlayer | null = null;
let loadSequence = 0;
let failStreak = 0;
/** 本次 loading 开始的时间；超过阈值仍 loading 视为取链挂死，播放键允许强制重试。 */
let loadingSince = 0;
const STALE_LOADING_MS = 12_000;
/** 当前 player 里装载的音源地址；切音质时用它判断是否真的换了源。 */
let currentSourceUri: string | null = null;
/** 当前音源码率（bps）；非会员各档位可能都返回试听码率，用于跳过无效换源。 */
let currentBitrate: number | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
// 每次“建立新队列”都会自增；后台补齐歌单剩余曲目时靠它判断队列是否已被替换。
let queueGeneration = 0;

// expo-audio 单 player 的锁屏/通知栏没有上一首/下一首命令(原生侧明确移除),
// 只有 播放暂停+进度条+±10 秒;切歌按钮需迁移原生队列(AudioPlaylist),暂不做。
const LOCK_SCREEN_OPTIONS: AudioLockScreenOptions = {
  showSeekForward: true,
  showSeekBackward: true,
};

/** 原生侧音源加载/解码失败时给用户的统一文案（详情只进日志，不打扰用户）。 */
const SOURCE_FAILED_MESSAGE = '播放源已失效，点此重试';

function lockScreenMetadataFor(track: PlayerTrack): AudioMetadata {
  return {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: sizedImage(track.coverUrl, 480) ?? undefined,
  };
}

function ensureAudioPlayer(): AudioPlayer {
  if (audioPlayer) {
    return audioPlayer;
  }

  audioPlayer = createAudioPlayer(null, { updateInterval: 100 });
  audioPlayer.addListener('playbackStatusUpdate', handlePlaybackStatus);
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });

  return audioPlayer;
}

function handlePlaybackStatus(status: AudioStatus) {
  const current = progressStore.getState();
  const playing = status.playing;
  progressStore.setState({
    positionMs: Math.max(0, Math.round(status.currentTime * 1000)),
    durationMs: status.duration > 0 ? Math.round(status.duration * 1000) : current.durationMs,
    playing,
    positionUpdatedAt: Date.now(),
  });

  const state = playerStore.getState();
  const buffering = status.isBuffering && !status.playing;
  if (state.playing !== playing || state.buffering !== buffering) {
    playerStore.setState({ playing, buffering });
  }

  // 音源失效（URL 过期 / CDN 拒绝 / 解码失败）唯一的暴露渠道是 status.error。
  // 漏掉它状态机会停在 playing=false + error=''：UI 显示暂停态，播放键只对死源反复 play()。
  if (status.error && !state.loading && !state.error) {
    if (__DEV__) {
      console.warn('[player] source playback failed:', status.error);
    }
    playerStore.setState({ error: SOURCE_FAILED_MESSAGE });
  } else if (!status.error && state.error === SOURCE_FAILED_MESSAGE) {
    // expo-audio 在新源装载或恢复播放后会自动清除 error，提示同步撤回
    playerStore.setState({ error: '' });
  }

  if (status.didJustFinish) {
    handleTrackFinished();
  }
}

function handleTrackFinished() {
  const { mode, queue } = playerStore.getState();

  if (mode === 'single' || queue.length <= 1) {
    const player = ensureAudioPlayer();
    void player.seekTo(0);
    player.play();
    return;
  }

  void skip(1, true);
}

function pickNextIndex(step: 1 | -1, auto: boolean): number {
  const { queue, index, mode } = playerStore.getState();
  if (!queue.length) {
    return -1;
  }

  if (mode === 'shuffle' && queue.length > 1 && (auto || step === 1)) {
    let candidate = index;
    while (candidate === index) {
      candidate = Math.floor(Math.random() * queue.length);
    }
    return candidate;
  }

  return (index + step + queue.length) % queue.length;
}

async function loadTrackAt(index: number, options?: { autoplay?: boolean }) {
  const { queue } = playerStore.getState();
  const track = queue[index];
  if (!track) {
    return;
  }

  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  const sequence = ++loadSequence;
  loadingSince = Date.now();
  playerStore.setState({
    index,
    track,
    loading: true,
    error: '',
    lyrics: [],
    // 换曲即刻后台预取歌词，与取播放地址并行；打开播放页时大概率已就绪
    lyricsStatus: 'loading',
  });
  progressStore.setState({ positionMs: 0, durationMs: track.durationMs ?? 0, positionUpdatedAt: Date.now() });
  loadLyricsFor(track, sequence);

  try {
    const source = await resolveSongSource(track);
    if (sequence !== loadSequence) {
      return;
    }

    // 取链兜底换过音源时（歌单下发的 hash 不标准），把实际音源标识回写到曲目，
    // 歌词、锁屏等后续流程都以换源后的 hash 为准。
    let effectiveTrack = track;
    if (source.hash && source.hash !== track.hash) {
      effectiveTrack = {
        ...track,
        hash: source.hash,
        albumAudioId: source.albumAudioId ?? track.albumAudioId,
      };
      const { queue } = playerStore.getState();
      const nextQueue = [...queue];
      if (nextQueue[index]) {
        nextQueue[index] = effectiveTrack;
      }
      playerStore.setState({ track: effectiveTrack, queue: nextQueue });
      // 预取用的是换源前 hash，作废后按有效 hash 重取歌词
      lyricRun += 1;
      loadLyricsFor(effectiveTrack, sequence);
    }

    const player = ensureAudioPlayer();
    player.replace({ uri: source.uri });
    currentSourceUri = source.uri;
    currentBitrate = source.bitrate ?? null;
    // 每次换曲重新激活即可同步刷新锁屏元数据;Android 侧同时启动前台服务,
    // 保证息屏后台连续播放不受系统 3 分钟限制。
    player.setActiveForLockScreen(true, lockScreenMetadataFor(effectiveTrack), LOCK_SCREEN_OPTIONS);
    if (options?.autoplay !== false) {
      player.play();
    }

    failStreak = 0;
    loadingSince = 0;
    playerStore.setState({ loading: false });
    if (source.durationMs > 0) {
      progressStore.setState({ durationMs: source.durationMs });
    }

  } catch (error) {
    if (sequence !== loadSequence) {
      return;
    }

    failStreak += 1;
    loadingSince = 0;
    playerStore.setState({
      loading: false,
      playing: false,
      buffering: false,
      lyricsStatus: 'empty',
      error: error instanceof Error ? error.message : '播放失败，请稍后重试',
    });

    const { queue: currentQueue } = playerStore.getState();
    const maxStreak = Math.min(currentQueue.length, 6);
    if (currentQueue.length > 1 && failStreak < maxStreak) {
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        void skip(1, true);
      }, 1400);
    }
  }
}

/** 歌词加载的独立代际：换源导致 hash 变化时重取，作废旧 hash 的在途结果。 */
let lyricRun = 0;

function loadLyricsFor(track: PlayerTrack, sequence: number) {
  const run = lyricRun;
  void (async () => {
    try {
      const lines = await loadLyricLines(track);
      if (run !== lyricRun || sequence !== loadSequence) {
        return;
      }

      playerStore.setState({
        lyrics: lines,
        lyricsStatus: lines.length ? 'ready' : 'empty',
      });
    } catch {
      if (run === lyricRun && sequence === loadSequence) {
        playerStore.setState({ lyrics: [], lyricsStatus: 'empty' });
      }
    }
  })();
}

async function skip(step: 1 | -1, auto = false) {
  const nextIndex = pickNextIndex(step, auto);
  if (nextIndex < 0) {
    return;
  }

  await loadTrackAt(nextIndex);
}

/** 当前队列的 generation 是否仍是 expected（供后台补齐判断队列是否已被替换/清空）。 */
export function isCurrentQueueGeneration(expected: number): boolean {
  return expected === queueGeneration;
}

export const playerActions = {
  async loadLyrics() {
    const { track, lyricsStatus } = playerStore.getState();
    if (!track || lyricsStatus !== 'idle') {
      return;
    }

    playerStore.setState({ lyricsStatus: 'loading' });
    loadLyricsFor(track, loadSequence);
  },

  /**
   * 用一批曲目建立新队列并从 startIndex 开始播放。
   * 返回本次队列的 generation，供 appendTracks 后台补齐时校验队列未被替换；
   * 无可播曲目时返回 null。
   */
  async playTracks(tracks: PlayerTrack[], startIndex = 0): Promise<number | null> {
    const playable = tracks.filter((track) => track.hash);
    if (!playable.length) {
      return null;
    }

    const targetHash = tracks[startIndex]?.hash;
    const index = Math.max(
      0,
      playable.findIndex((track) => track.hash === targetHash)
    );

    failStreak = 0;
    const generation = ++queueGeneration;
    playerStore.setState({ queue: playable });
    await loadTrackAt(index);
    return generation;
  },

  /**
   * 把后续分页的曲目追加到当前队列末尾（按 hash 去重）。
   * generation 与当前队列不一致（队列已被替换/清空）时不追加并返回 false。
   */
  appendTracks(tracks: PlayerTrack[], generation: number): boolean {
    if (generation !== queueGeneration) {
      return false;
    }

    const { queue } = playerStore.getState();
    if (!queue.length) {
      return false;
    }

    const seen = new Set(queue.map((track) => track.hash));
    const fresh = tracks.filter((track) => track.hash && !seen.has(track.hash));
    if (fresh.length) {
      playerStore.setState({ queue: [...queue, ...fresh] });
    }

    return true;
  },

  async playTrackNow(track: PlayerTrack) {
    if (!track.hash) {
      return;
    }

    const { queue, index } = playerStore.getState();
    const existing = queue.findIndex((item) => item.hash === track.hash);
    if (existing >= 0) {
      await loadTrackAt(existing);
      return;
    }

    // 插播只是把歌插到当前曲目之后，不改变队列归属：
    // 歌单的后台补齐继续追加到队尾，顺序仍与歌单一致。
    const nextQueue = [...queue];
    nextQueue.splice(index + 1, 0, track);
    failStreak = 0;
    playerStore.setState({ queue: nextQueue });
    await loadTrackAt(index + 1);
  },

  pause() {
    playerStore.getState().track && audioPlayer?.pause();
  },

  toggle() {
    const { track, playing, loading, error } = playerStore.getState();
    if (!track) {
      return;
    }

    if (loading && Date.now() - loadingSince < STALE_LOADING_MS) {
      return;
    }

    // error 态（含音源失效）与挂死超时的 loading 都重新走取链：
    // 对已经失效的 source 调用 play() 不会产生任何效果。
    if (error || loading) {
      void loadTrackAt(playerStore.getState().index);
      return;
    }

    const player = ensureAudioPlayer();
    if (playing) {
      player.pause();
      return;
    }

    const { positionMs, durationMs } = progressStore.getState();
    if (durationMs > 0 && positionMs >= durationMs - 300) {
      void player.seekTo(0);
    }
    player.play();
  },

  next() {
    void skip(1);
  },

  previous() {
    void skip(-1);
  },

  /**
   * 切换音质并立即对当前歌曲生效：换新音源后跳回原进度继续播，
   * 不从头开始；云盘歌曲与解析失败时保持现状。
   */
  async applyQuality(quality: QualityId) {
    settingsActions.setQuality(quality);

    const state = playerStore.getState();
    if (!state.track || state.track.source === 'cloud' || state.loading) {
      return;
    }

    const sequence = loadSequence;

    try {
      const source = await resolveSongSource(state.track, quality);
      if (
        // 期间已切歌/清空队列：新曲目的加载流程自己管理 loading，这里不插手，
        // 否则会把别的音源塞进 player 并把 loading 卡死。
        sequence !== loadSequence ||
        !source.uri ||
        source.uri === currentSourceUri ||
        // 酷狗对非会员各档位都返回同一试听码率：内容没变就不要打断播放。
        (source.bitrate != null && currentBitrate != null && source.bitrate === currentBitrate)
      ) {
        return;
      }

      const player = ensureAudioPlayer();
      const { positionMs } = progressStore.getState();
      const wasPlaying = state.playing;

      loadingSince = Date.now();
      playerStore.setState({ loading: true, error: '' });
      player.replace({ uri: source.uri });
      currentSourceUri = source.uri;
      currentBitrate = source.bitrate ?? currentBitrate;
      // 换源后给原生层一点加载时间再跳进度，避免 seek 落空回到 0。
      await new Promise((resolve) => setTimeout(resolve, 250));
      await player.seekTo(positionMs / 1000);
      progressStore.setState({ positionMs, positionUpdatedAt: Date.now() });
      if (wasPlaying) {
        player.play();
      } else {
        player.pause();
      }
      if (sequence === loadSequence) {
        playerStore.setState({ loading: false });
      }
    } catch {
      // 换源失败静默保留当前播放，用户可继续用原音质听；但 loading 必须复位，
      // 否则 toggle() 会被 loading 拦截挡住，播放键永久失效。
      if (sequence === loadSequence) {
        playerStore.setState({ loading: false });
      }
    }
  },

  seekToMs(positionMs: number) {
    const { track } = playerStore.getState();
    if (!track || !audioPlayer) {
      return;
    }

    const { durationMs } = progressStore.getState();
    const clamped = Math.max(0, durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs);
    progressStore.setState({ positionMs: clamped, positionUpdatedAt: Date.now() });
    void audioPlayer.seekTo(clamped / 1000);
  },

  setMode(mode: PlayMode) {
    playerStore.setState({ mode });
  },

  cycleMode() {
    const { mode } = playerStore.getState();
    const order: PlayMode[] = ['sequence', 'shuffle', 'single'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    playerStore.setState({ mode: next });
    return next;
  },

  async jumpTo(index: number) {
    const { queue } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    await loadTrackAt(index);
  },

  removeAt(index: number) {
    const { queue, index: currentIndex } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== index);

    if (!nextQueue.length) {
      playerActions.clearQueue();
      return;
    }

    if (index === currentIndex) {
      playerStore.setState({ queue: nextQueue });
      void loadTrackAt(Math.min(index, nextQueue.length - 1));
      return;
    }

    playerStore.setState({
      queue: nextQueue,
      index: index < currentIndex ? currentIndex - 1 : currentIndex,
    });
  },

  clearQueue() {
    loadSequence += 1;
    queueGeneration += 1;
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }

    currentSourceUri = null;
    currentBitrate = null;
    audioPlayer?.pause();
    audioPlayer?.clearLockScreenControls();
    playerStore.setState({
      ...INITIAL_PLAYER_STATE,
      mode: playerStore.getState().mode,
    });
    progressStore.setState(INITIAL_PROGRESS_STATE);
  },
};

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    playerStore.subscribe,
    playerStore.getState,
    playerStore.getInitialState
  );
}

/** 仅订阅“是否有曲目”这一布尔值，供布局类组件使用，避免高频重渲染。 */
export function useHasTrack(): boolean {
  return useSyncExternalStore(
    playerStore.subscribe,
    () => Boolean(playerStore.getState().track),
    () => false
  );
}

export function usePlayerProgress(): ProgressState {
  return useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressStore.getInitialState
  );
}

type ProgressSelection = string | number | boolean | null | undefined;

export function usePlayerProgressSelector<T extends ProgressSelection>(
  selector: (state: ProgressState) => T
): T {
  return useSyncExternalStore(
    progressStore.subscribe,
    () => selector(progressStore.getState()),
    () => selector(progressStore.getInitialState())
  );
}
