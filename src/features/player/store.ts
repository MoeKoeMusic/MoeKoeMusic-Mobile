import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { useSyncExternalStore } from 'react';

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
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

function ensureAudioPlayer(): AudioPlayer {
  if (audioPlayer) {
    return audioPlayer;
  }

  audioPlayer = createAudioPlayer(null, { updateInterval: 500 });
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
  progressStore.setState({
    positionMs: Math.max(0, Math.round(status.currentTime * 1000)),
    durationMs: status.duration > 0 ? Math.round(status.duration * 1000) : current.durationMs,
  });

  const state = playerStore.getState();
  const playing = status.playing;
  const buffering = status.isBuffering && !status.playing;
  if (state.playing !== playing || state.buffering !== buffering) {
    playerStore.setState({ playing, buffering });
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
  playerStore.setState({
    index,
    track,
    loading: true,
    error: '',
    lyrics: [],
    lyricsStatus: 'loading',
  });
  progressStore.setState({ positionMs: 0, durationMs: track.durationMs ?? 0 });

  try {
    const source = await resolveSongSource(track);
    if (sequence !== loadSequence) {
      return;
    }

    const player = ensureAudioPlayer();
    player.replace({ uri: source.uri });
    if (options?.autoplay !== false) {
      player.play();
    }

    failStreak = 0;
    playerStore.setState({ loading: false });
    if (source.durationMs > 0) {
      progressStore.setState({ durationMs: source.durationMs });
    }

    // 歌词延后到确认可播放之后再取，跳歌链路上不浪费请求
    void loadLyricsFor(track, sequence);
  } catch (error) {
    if (sequence !== loadSequence) {
      return;
    }

    failStreak += 1;
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

async function loadLyricsFor(track: PlayerTrack, sequence: number) {
  try {
    const lines = await loadLyricLines(track);
    if (sequence !== loadSequence) {
      return;
    }

    playerStore.setState({
      lyrics: lines,
      lyricsStatus: lines.length ? 'ready' : 'empty',
    });
  } catch {
    if (sequence === loadSequence) {
      playerStore.setState({ lyrics: [], lyricsStatus: 'empty' });
    }
  }
}

async function skip(step: 1 | -1, auto = false) {
  const nextIndex = pickNextIndex(step, auto);
  if (nextIndex < 0) {
    return;
  }

  await loadTrackAt(nextIndex);
}

export const playerActions = {
  async playTracks(tracks: PlayerTrack[], startIndex = 0) {
    const playable = tracks.filter((track) => track.hash);
    if (!playable.length) {
      return;
    }

    const targetHash = tracks[startIndex]?.hash;
    const index = Math.max(
      0,
      playable.findIndex((track) => track.hash === targetHash)
    );

    failStreak = 0;
    playerStore.setState({ queue: playable });
    await loadTrackAt(index);
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

    const nextQueue = [...queue];
    nextQueue.splice(index + 1, 0, track);
    failStreak = 0;
    playerStore.setState({ queue: nextQueue });
    await loadTrackAt(index + 1);
  },

  toggle() {
    const { track, playing, loading, error } = playerStore.getState();
    if (!track || loading) {
      return;
    }

    if (error) {
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

  seekToMs(positionMs: number) {
    const { track } = playerStore.getState();
    if (!track || !audioPlayer) {
      return;
    }

    const { durationMs } = progressStore.getState();
    const clamped = Math.max(0, durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs);
    progressStore.setState({ positionMs: clamped });
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
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }

    audioPlayer?.pause();
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
