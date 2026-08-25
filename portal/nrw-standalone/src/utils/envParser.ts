// Values loaded from the .env (see sample.env).
// These are imported as `#config`
const env = import.meta.env;

export const nrwApiBackend: string = env.APP_NRW_API_BACKEND ?? '';
export const mbtoken: string = env.APP_MAPBOX_ACCESS_TOKEN ?? '';
export const seedDataRepo: string = env.APP_SEED_DATA_REPO ?? '';
export const nrwPortalMode: string = env.APP_NRW_PORTAL_MODE ?? '';
