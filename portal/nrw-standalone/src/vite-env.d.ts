/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_MAPTILER_API_KEY: string;
  readonly APP_IBF_API_BACKEND: string;
  readonly APP_SEED_DATA_REPO: string;
  readonly APP_NRW_PORTAL_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
