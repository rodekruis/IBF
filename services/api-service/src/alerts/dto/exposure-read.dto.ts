import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { ExposureDto } from '@api-service/src/alerts/dto/exposure.dto';
import { ExposureAdminAreaReadDto } from '@api-service/src/alerts/dto/exposure-admin-area-read.dto';
import { ExposureGeoFeatureReadDto } from '@api-service/src/alerts/dto/exposure-geo-feature-read.dto';
import { ExposureRasterReadDto } from '@api-service/src/alerts/dto/exposure-raster-read.dto';

export class ExposureReadDto extends ExposureDto {
  @ApiProperty({
    type: [ExposureAdminAreaReadDto],
  })
  @Type(() => ExposureAdminAreaReadDto)
  declare public readonly adminAreas: ExposureAdminAreaReadDto[];

  @ApiProperty({ type: [ExposureGeoFeatureReadDto] })
  @Type(() => ExposureGeoFeatureReadDto)
  declare public readonly geoFeatures?: ExposureGeoFeatureReadDto[];

  @ApiProperty({ type: [ExposureRasterReadDto] })
  @Type(() => ExposureRasterReadDto)
  declare public readonly rasters: ExposureRasterReadDto[];
}
