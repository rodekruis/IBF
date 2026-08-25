// Values loaded from the .env (see sample.env).
// These are imported as `#config`
const env = import.meta.env;

export const nrwApiBackend: string = env.APP_NRW_API_BACKEND ?? '';
// Legacy alias consumed by the go-web-app submodule for the prototype dev flow (Aug 2026).
// This can be removed when we change to the nrw-develop/ branch deploy flow.
export const ibfApiBackend: string = nrwApiBackend;
export const mbtoken: string = env.APP_MAPBOX_ACCESS_TOKEN ?? '';
export const seedDataRepo: string = env.APP_SEED_DATA_REPO ?? '';
export const nrwPortalMode: string = env.APP_NRW_PORTAL_MODE ?? '';
