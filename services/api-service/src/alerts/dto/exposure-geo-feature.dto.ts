import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString } from 'class-validator';

import { LayerName } from '@api-service/src/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class ExposureGeoFeatureDto {
  @ApiProperty({ example: 'station-001' })
  @IsString()
  public readonly geoFeatureId: string;

  @ApiProperty({ enum: LayerName, example: LayerName.glofasStations })
  @IsEnum(LayerName)
  public readonly layer: LayerName;

  @ApiProperty({ example: { triggered: true, severity: 0.8 } })
  @IsObject()
  public readonly attributes: Record<string, unknown>;
}

// Example shape of the `waterDischarge` key in `ExposureGeoFeatureDto.attributes` above (m3/s).
// Also reused as the typed response shape in events/dto/event-geo-feature.dto.ts.
export class WaterDischargeTimeSeriesEntryDto {
  @ApiProperty({ example: '2026-03-20T00:00:00Z' })
  public readonly start: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly end: string;

  @ApiProperty({ example: 120 })
  public readonly median: number;

  @ApiProperty({ example: 90 })
  public readonly low: number;

  @ApiProperty({ example: 150 })
  public readonly high: number;
}
