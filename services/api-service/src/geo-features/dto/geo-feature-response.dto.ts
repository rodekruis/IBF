import { IntersectionType } from '@nestjs/swagger';

import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class GeoFeatureResponseDto extends IntersectionType(
  BaseDto,
  GeoFeatureCreateDto,
) {}
