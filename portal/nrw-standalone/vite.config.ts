import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  envPrefix: 'APP_',
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
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
      '#base': fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
    },
  },
});
