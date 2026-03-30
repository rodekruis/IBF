import { CreateAlertDto } from '@api-service/src/alerts/dto/create-alert.dto';
import { SeverityEntryDto } from '@api-service/src/alerts/dto/severity-entry.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';

export function buildAlert(
  overrides: Partial<CreateAlertDto> = {},
): CreateAlertDto {
  return {
    alertName: 'KEN_floods_test-station',
    issuedAt: '2026-03-30T00:00:00Z',
    centroid: { latitude: 0.35, longitude: 32.6 },
    hazardTypes: [HazardType.floods],
    forecastSources: [ForecastSource.glofas],
    severityData: [
      {
        leadTime: {
          start: '2026-03-30T00:00:00Z',
          end: '2026-03-31T00:00:00Z',
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        leadTime: {
          start: '2026-03-30T00:00:00Z',
          end: '2026-03-31T00:00:00Z',
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: 'water_discharge',
        severityValue: 135.0,
      },
    ],
    exposure: {
      adminArea: [
        {
          placeCode: 'KEN_01',
          adminLevel: 3,
          layer: Layer.spatialExtent,
          value: 1,
        },
      ],
      rasters: [
        {
          layer: Layer.alertExtent,
          value: 'base64',
          extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
        },
      ],
    },
    ...overrides,
  };
}

export function buildSeverityData(
  start: string,
  end: string,
  medianValue: number,
  runValues: number[],
): SeverityEntryDto[] {
  return [
    {
      leadTime: { start, end },
      ensembleMemberType: EnsembleMemberType.median,
      severityKey: 'water_discharge',
      severityValue: medianValue,
    },
    ...runValues.map((value) => ({
      leadTime: { start, end },
      ensembleMemberType: EnsembleMemberType.run as const,
      severityKey: 'water_discharge',
      severityValue: value,
    })),
  ];
}
