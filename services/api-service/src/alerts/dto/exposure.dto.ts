import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';

import { ExposureAdminAreaDto } from '@api-service/src/alerts/dto/exposure-admin-area.dto';
import { ExposureGeoFeatureDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import { ExposureRasterDto } from '@api-service/src/alerts/dto/exposure-raster.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class ExposureDto {
  @ApiProperty({
    type: [ExposureAdminAreaDto],
    example: [
      {
        placeCode: 'KEN_01_001',
        adminLevel: 3,
        layer: LayerName.populationExposed,
        value: 4500,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExposureAdminAreaDto)
  public readonly adminAreas: ExposureAdminAreaDto[];

  @ApiProperty({ type: [ExposureGeoFeatureDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExposureGeoFeatureDto)
  public readonly geoFeatures?: ExposureGeoFeatureDto[];

  @ApiProperty({ type: [ExposureRasterDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExposureRasterDto)
  public readonly rasters?: ExposureRasterDto[];
}
