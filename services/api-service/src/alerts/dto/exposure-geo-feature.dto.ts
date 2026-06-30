import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString } from 'class-validator';

import { LayerName } from '@api-service/src/shared-enums';

export class ExposureGeoFeatureDto {
  @ApiProperty({ example: 'station-001' })
  @IsString()
  public readonly geoFeatureId: string;

  @ApiProperty({ enum: LayerName, example: LayerName.glofasStations })
  @IsEnum(LayerName)
  public readonly layer: LayerName;

  @ApiProperty({ example: { triggered: true, severity: 0.8 } })
  @IsObject()
  public readonly attributes: Record<string, string | number | boolean>;
}
