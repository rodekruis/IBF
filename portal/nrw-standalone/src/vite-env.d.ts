/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_MAPTILER_API_KEY: string;
  readonly APP_IBF_API_BACKEND: string;
  readonly APP_MAP_PG_TILESERV: string;
  readonly APP_MAP_PG_FEATURESERV: string;
  readonly APP_SEED_DATA_REPO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
