import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';

export const VALID_ALERT = {
  alertName: 'TEST-flood-2026-03-23',
  issuedAt: '2026-03-23T12:00:00Z',
  centroid: { latitude: 0.35, longitude: 32.6 },
  hazardTypes: [HazardType.floods],
  forecastSources: [ForecastSource.glofas],
  severityData: [
    {
      leadTime: { start: '2026-03-23T00:00:00Z', end: '2026-03-23T23:59:59Z' },
      ensembleMemberType: EnsembleMemberType.median,
      severityKey: 'water_discharge',
      severityValue: 120.5,
    },
    {
      leadTime: { start: '2026-03-23T00:00:00Z', end: '2026-03-23T23:59:59Z' },
      ensembleMemberType: EnsembleMemberType.run,
      severityKey: 'water_discharge',
      severityValue: 135.0,
    },
  ],
  exposure: {
    adminArea: [
      {
        placeCode: 'KEN_01_001',
        adminLevel: 3,
        layer: Layer.populationExposed,
        value: 1,
      },
    ],
    rasters: [
      {
        layer: Layer.alertExtent,
        value: 'raster-file-path.tif',
        extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
      },
    ],
  },
};
