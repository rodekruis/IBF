// This enum cannot be defined in the postgres datamodel, because no spaces are allowed in values.
export enum LayerLabel {
  populationDensity = 'Population density',
  exposedPopulation = 'Exposed population',
  floodDepth = 'Flood depth',
  glofasStations = 'GloFAS stations',
  windSpeed = 'Wind speed',
}
