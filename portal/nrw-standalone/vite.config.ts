import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      '#utils': fileURLToPath(new URL('./src/go-web-app/app/src/utils', import.meta.url)),
      '#hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      '#components': fileURLToPath(new URL('./src/go-web-app/app/src/components', import.meta.url)),
    },
  },
})
