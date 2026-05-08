// Values loaded from the .env (see sample.env).
// These are imported as `#config`
const env = import.meta.env;

export const maptilerApiKey: string = env.APP_MAPTILER_API_KEY ?? '';
export const pgFeatureserv: string = env.APP_MAP_PG_FEATURESERV ?? '';
export const seedDataRepo: string = env.APP_SEED_DATA_REPO ?? '';
