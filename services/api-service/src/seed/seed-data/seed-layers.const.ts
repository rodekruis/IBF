import {
  HazardType,
  LayerLabel,
  LayerName,
  LayerType,
} from '@api-service/src/shared-enums';

export interface SeedLayer {
  readonly name: LayerName;
  readonly label: LayerLabel;
  readonly type: LayerType;
  readonly hazardType: HazardType | null;
}

export const SEED_LAYERS: SeedLayer[] = [
  {
    name: LayerName.populationDensity,
    label: LayerLabel.populationDensity,
    type: LayerType.raster,
    hazardType: null,
  },
  {
    name: LayerName.exposedPopulation,
    label: LayerLabel.exposedPopulation,
    type: LayerType.shape,
    hazardType: null,
  },
  {
    name: LayerName.redCrossBranches,
    label: LayerLabel.redCrossBranches,
    type: LayerType.point,
    hazardType: null,
  },
  {
    name: LayerName.clinics,
    label: LayerLabel.clinics,
    type: LayerType.point,
    hazardType: null,
  },
  {
    name: LayerName.floodDepth,
    label: LayerLabel.floodDepth,
    type: LayerType.raster,
    hazardType: HazardType.floods,
  },
  {
    name: LayerName.glofasStations,
    label: LayerLabel.glofasStations,
    type: LayerType.point,
    hazardType: HazardType.floods,
  },
  {
    name: LayerName.windSpeed,
    label: LayerLabel.windSpeed,
    type: LayerType.raster,
    hazardType: HazardType.tropicalCyclone,
  },
];
