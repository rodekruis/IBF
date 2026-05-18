// NOTE: This is a shared enum. If changed, run `npm run gen:enums`
// from the repo root to regenerate the Python and frontend enums.
// The frontend enums will also need to be updated via a PR into that repo.

export enum ForecastSource {
  glofas = 'glofas',
  ecmwf = 'ECMWF',
}
