import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT_ID, isAccentPresetId, type AccentPresetId } from '@/constants/accents';

import { readStoredAppearance, writeStoredAppearance } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export type LyricAlign = 'center' | 'left';

/** 播放音质；'flac' 需要会员，取不到时播放层自动回退标准音质。 */
export type QualityId = '128' | '320' | 'flac';

/** 歌词字号档位（px）。 */
export type LyricFontSize = 18 | 22 | 26;

export function isLyricFontSize(value: unknown): value is LyricFontSize {
  return value === 18 || value === 22 || value === 26;
}

export type SettingsState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  accentId: AccentPresetId;
  lyricAlign: LyricAlign;
  lyricFontSize: LyricFontSize;
  quality: QualityId;
};

const INITIAL_SETTINGS_STATE: SettingsState = {
  hydrated: false,
  themeMode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  lyricAlign: 'center',
  lyricFontSize: 22,
  quality: '128',
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

const settingsStore = createStore(INITIAL_SETTINGS_STATE);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLyricAlign(value: unknown): value is LyricAlign {
  return value === 'center' || value === 'left';
}

function isQualityId(value: unknown): value is QualityId {
  return value === '128' || value === '320' || value === 'flac';
}

let hydrationPromise: Promise<void> | null = null;

/** 在根布局模块作用域调用一次;UI 由 hydrated 门控,不存在与用户操作的竞态。 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readStoredAppearance();
      settingsStore.setState({
        themeMode: stored && isThemeMode(stored.themeMode) ? stored.themeMode : 'system',
        accentId: stored && isAccentPresetId(stored.accentId) ? stored.accentId : DEFAULT_ACCENT_ID,
        lyricAlign: stored && isLyricAlign(stored.lyricAlign) ? stored.lyricAlign : 'center',
        lyricFontSize: stored && isLyricFontSize(stored.lyricFontSize) ? stored.lyricFontSize : 22,
        quality: stored && isQualityId(stored.quality) ? stored.quality : '128',
        hydrated: true,
      });
    })().catch(() => {
      settingsStore.setState({ hydrated: true });
    });
  }
  return hydrationPromise;
}

function persist() {
  const { themeMode, accentId, lyricAlign, lyricFontSize, quality } = settingsStore.getState();
  void writeStoredAppearance({ themeMode, accentId, lyricAlign, lyricFontSize, quality });
}

export const settingsActions = {
  setThemeMode(themeMode: ThemeMode) {
    settingsStore.setState({ themeMode });
    persist();
  },
  setAccentId(accentId: AccentPresetId) {
    settingsStore.setState({ accentId });
    persist();
  },
  setLyricAlign(lyricAlign: LyricAlign) {
    settingsStore.setState({ lyricAlign });
    persist();
  },
  setLyricFontSize(lyricFontSize: LyricFontSize) {
    settingsStore.setState({ lyricFontSize });
    persist();
  },
  setQuality(quality: QualityId) {
    settingsStore.setState({ quality });
    persist();
  },
};

export function useSettings(): SettingsState {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getState,
    settingsStore.getInitialState
  );
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().themeMode,
    () => INITIAL_SETTINGS_STATE.themeMode
  );
}

export function useAccentId(): AccentPresetId {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().accentId,
    () => INITIAL_SETTINGS_STATE.accentId
  );
}

export function useLyricAlign(): LyricAlign {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().lyricAlign,
    () => INITIAL_SETTINGS_STATE.lyricAlign
  );
}

export function useLyricFontSize(): LyricFontSize {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().lyricFontSize,
    () => INITIAL_SETTINGS_STATE.lyricFontSize
  );
}

export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().hydrated,
    () => INITIAL_SETTINGS_STATE.hydrated
  );
}

/** 供播放层在请求播放地址时读取音质偏好（非 hook 场景）。 */
export function getPreferredQuality(): QualityId {
  return settingsStore.getState().quality;
}

export function useQuality(): QualityId {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().quality,
    () => INITIAL_SETTINGS_STATE.quality
  );
}
