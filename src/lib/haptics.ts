/**
 * 触觉反馈的统一入口。
 *
 * expo-haptics 是原生模块：当前已安装的 APK 里没有它，直接 import 会在启动时崩溃，
 * 所以用 require + try/catch 兜底——老包上静默跳过，下次重打包后自动生效。
 * 触觉必须与视觉同一帧触发、每次操作最多一次，且永远不能是唯一反馈。
 */

type HapticsModule = {
  selectionAsync?: () => Promise<void>;
  impactAsync?: (style: number) => Promise<void>;
  ImpactFeedbackStyle?: { Light: number; Medium: number; Heavy: number };
};

let mod: HapticsModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-haptics') as HapticsModule;
} catch {
  mod = null;
}

/** 轻量选择反馈：档位切换、分段控件等「值越过一格」的时刻。 */
export function selectionHaptic(): void {
  void mod?.selectionAsync?.().catch(() => undefined);
}

/** 轻冲击反馈：播放/暂停等状态提交的时刻。 */
export function lightImpactHaptic(): void {
  const style = mod?.ImpactFeedbackStyle?.Light;
  if (style === undefined) {
    return;
  }
  void mod?.impactAsync?.(style).catch(() => undefined);
}
