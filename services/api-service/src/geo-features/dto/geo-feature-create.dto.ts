import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

import { Layer } from '@api-service/src/alerts/enum/shared-enums';
import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';

export class GeoFeatureCreateDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiProperty({ enum: GeoFeatureType, example: GeoFeatureType.point })
  @IsEnum(GeoFeatureType)
  public readonly featureType: GeoFeatureType;

  @ApiProperty({ enum: Layer, example: Layer.glofasStations })
  @IsEnum(Layer)
  public readonly layer: Layer;

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
