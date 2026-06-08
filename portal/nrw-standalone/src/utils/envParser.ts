// Values loaded from the .env (see sample.env).
// These are imported as `#config`
const env = import.meta.env;

export const ibfApiBackend: string = env.APP_IBF_API_BACKEND ?? '';
export const maptilerApiKey: string = env.APP_MAPTILER_API_KEY ?? '';
export const seedDataRepo: string = env.APP_SEED_DATA_REPO ?? '';
