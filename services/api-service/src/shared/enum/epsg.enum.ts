// This enum cannot be defined in the postgres datamodel, because no colons are allowed in values.
export enum EPSG {
  WGS84 = 'EPSG:4326',
  WebMercator = 'EPSG:3857',
}
