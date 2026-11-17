import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zukito.spaceimpactdefender3d',
  appName: 'Space Impact Defenders 3D',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
