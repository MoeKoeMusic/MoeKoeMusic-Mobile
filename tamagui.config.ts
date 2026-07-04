import { createAnimations } from '@tamagui/animations-react-native';
import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

const animations = createAnimations({
  '100ms': { type: 'timing', duration: 100 },
  '200ms': { type: 'timing', duration: 200 },
  bouncy: { type: 'spring', damping: 9, mass: 0.9, stiffness: 150 },
  lazy: { type: 'spring', damping: 18, stiffness: 50 },
  medium: { type: 'spring', damping: 15, stiffness: 120, mass: 1 },
  slow: { type: 'spring', damping: 15, stiffness: 40 },
  quick: { type: 'spring', damping: 20, mass: 1.1, stiffness: 250 },
  quicker: { type: 'spring', damping: 20, mass: 0.7, stiffness: 250 },
  quickest: { type: 'timing', duration: 80 },
  tooltip: { type: 'spring', damping: 10, mass: 0.9, stiffness: 100 },
});

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  settings: {
    ...defaultConfig.settings,
    fastSchemeChange: false,
    onlyAllowShorthands: false,
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default tamaguiConfig;
