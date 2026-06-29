import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { MapLayer } from '@api-service/src/shared-enums';

export class GeoFeatureCreateDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiProperty({ enum: GeoFeatureType, example: GeoFeatureType.point })
  @IsEnum(GeoFeatureType)
  public readonly featureType: GeoFeatureType;

  @ApiProperty({ enum: MapLayer, example: MapLayer.glofasStations })
  @IsEnum(MapLayer)
  public readonly mapLayer: MapLayer;

  @ApiProperty({ example: 'G5142' })
  @IsString()
  public readonly referenceId: string;

  @ApiProperty({
    example: { type: 'Point', coordinates: [37.194, -1.095] },
  })
  @IsObject()
  public readonly geometry: Record<string, unknown>;

  @ApiPropertyOptional({
    example: { name: 'ATHI MUNYU (3DA02)' },
  })
  @IsOptional()
  @IsObject()
  public readonly attributes?: Record<string, unknown>;
}
