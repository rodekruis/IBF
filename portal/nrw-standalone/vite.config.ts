import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

// https://vite.dev/config/
export default defineConfig({
  envPrefix: 'APP_',
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  css: {
    modules: {
      scopeBehaviour: 'local',
      localsConvention: 'camelCaseOnly',
    },
  },
  resolve: {
    alias: {
      '#utils': fileURLToPath(
        new URL('./src/go-web-app/app/src/utils', import.meta.url),
      ),
      '#hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      '#components': fileURLToPath(
        new URL('./src/go-web-app/app/src/components', import.meta.url),
      ),
      '#config': fileURLToPath(
        new URL('./src/utils/envParser.ts', import.meta.url),
      ),
    },
  },
});
