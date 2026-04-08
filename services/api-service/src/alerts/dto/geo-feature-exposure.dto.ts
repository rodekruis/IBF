import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString } from 'class-validator';

import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class GeoFeatureExposureDto {
  @ApiProperty({ example: 'station-001' })
  @IsString()
  public readonly geoFeatureId: string;

  @ApiProperty({ enum: Layer, example: Layer.glofasStations })
  @IsEnum(Layer)
  public readonly layer: Layer;

  @ApiProperty({ example: { triggered: true, severity: 0.8 } })
  @IsObject()
  public readonly attributes: Record<string, string | number | boolean>;
}

export class ReadGeoFeatureExposureDto extends IntersectionType(
  BaseDto,
  GeoFeatureExposureDto,
) {}
