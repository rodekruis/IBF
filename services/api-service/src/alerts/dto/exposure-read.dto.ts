import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { ExposureAdminAreaReadDto } from '@api-service/src/alerts/dto/exposure-admin-area-read.dto';
import { ExposureGeoFeatureReadDto } from '@api-service/src/alerts/dto/exposure-geo-feature-read.dto';
import { ExposureRasterReadDto } from '@api-service/src/alerts/dto/exposure-raster-read.dto';

export class ExposureReadDto {
  @ApiProperty({
    type: [ExposureAdminAreaReadDto],
  })
  @Type(() => ExposureAdminAreaReadDto)
  public readonly adminAreas: ExposureAdminAreaReadDto[];

  @ApiProperty({ type: [ExposureGeoFeatureReadDto] })
  @Type(() => ExposureGeoFeatureReadDto)
  public readonly geoFeatures?: ExposureGeoFeatureReadDto[];

  @ApiProperty({ type: [ExposureRasterReadDto] })
  @Type(() => ExposureRasterReadDto)
  public readonly rasters: ExposureRasterReadDto[];
}
