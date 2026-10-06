import { createAnimations } from '@tamagui/animations-react-native';

type AnimationDef =
  | { type: 'timing'; duration: number }
  | { type: 'spring'; damping: number; mass: number; stiffness: number };

/**
 * 动画曲线定义。createAnimations 闭包持有本对象引用，且每次动画启动时才读取，
 * 因此运行时原地改写各项即可全局开/关动画，无需重挂载 UI。
 */
const animationDefs: Record<string, AnimationDef> = {
  // 按压态：快而无回弹（iOS 按压是 ease-out，不是 spring）
  quickest: { type: 'timing', duration: 110 },
  // 卡片/弹层内小元素过渡：轻微弹性但不过冲
  quicker: { type: 'spring', damping: 26, mass: 1, stiffness: 340 },
  quick: { type: 'spring', damping: 24, mass: 1, stiffness: 300 },
  // Sheet 抽屉等中等位移：跟手且末端柔和
  medium: { type: 'spring', damping: 18, mass: 1, stiffness: 160 },
  slow: { type: 'spring', damping: 17, mass: 1, stiffness: 70 },
  bouncy: { type: 'spring', damping: 14, mass: 0.9, stiffness: 180 },
  lazy: { type: 'spring', damping: 18, mass: 1, stiffness: 60 },
  tooltip: { type: 'spring', damping: 13, mass: 0.9, stiffness: 130 },
  '100ms': { type: 'timing', duration: 100 },
  '200ms': { type: 'timing', duration: 200 },
};

const RESTORE_DEFS: Record<string, AnimationDef> = { ...animationDefs };
const INSTANT: AnimationDef = { type: 'timing', duration: 0 };

/** 全局开关动画；关闭后所有 Tamagui transition/animation 变为瞬时切换。 */
export function setAppAnimationsEnabled(enabled: boolean): void {
  for (const key of Object.keys(animationDefs)) {
    animationDefs[key] = enabled ? RESTORE_DEFS[key] : INSTANT;
  }
}

export const animations = createAnimations(animationDefs);
