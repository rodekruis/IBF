import { IntersectionType } from '@nestjs/swagger';

import { ExposureGeoFeatureDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class ExposureGeoFeatureReadDto extends IntersectionType(
  BaseDto,
  ExposureGeoFeatureDto,
) {}
