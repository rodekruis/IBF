import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString } from 'class-validator';

import { MapLayer } from '@api-service/src/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class ExposureGeoFeatureDto {
  @ApiProperty({ example: 'station-001' })
  @IsString()
  public readonly geoFeatureId: string;

  @ApiProperty({ enum: MapLayer, example: MapLayer.glofasStations })
  @IsEnum(MapLayer)
  public readonly mapLayer: MapLayer;

  @ApiProperty({ example: { triggered: true, severity: 0.8 } })
  @IsObject()
  public readonly attributes: Record<string, string | number | boolean>;
}
