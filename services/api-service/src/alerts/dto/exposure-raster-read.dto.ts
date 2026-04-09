import { IntersectionType } from '@nestjs/swagger';

import { ExposureRasterDto } from '@api-service/src/alerts/dto/exposure-raster.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class ExposureRasterReadDto extends IntersectionType(
  BaseDto,
  ExposureRasterDto,
) {}
