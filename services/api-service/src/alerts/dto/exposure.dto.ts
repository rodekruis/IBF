import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';

import { AdminAreaExposureDto } from '@api-service/src/alerts/dto/admin-area-exposure.dto';
import { GeoFeatureExposureDto } from '@api-service/src/alerts/dto/geo-feature-exposure.dto';
import { RasterExposureDto } from '@api-service/src/alerts/dto/raster-exposure.dto';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';

export class ExposureDto {
  @ApiProperty({
    type: [AdminAreaExposureDto],
    example: [
      {
        placeCode: 'KEN_01_001',
        adminLevel: 3,
        layer: Layer.spatialExtent,
        value: 1,
      },
      {
        placeCode: 'KEN_01_001',
        adminLevel: 3,
        layer: Layer.populationExposed,
        value: 4500,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminAreaExposureDto)
  public readonly adminArea: AdminAreaExposureDto[];

  @ApiProperty({ type: [GeoFeatureExposureDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeoFeatureExposureDto)
  public readonly geoFeatures?: GeoFeatureExposureDto[];

  @ApiProperty({ type: [RasterExposureDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RasterExposureDto)
  public readonly rasters: RasterExposureDto[];
}
