import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

import { animations, setAppAnimationsEnabled } from '@/constants/motion';

export { setAppAnimationsEnabled };

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
