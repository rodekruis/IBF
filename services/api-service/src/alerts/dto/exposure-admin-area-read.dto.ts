import { IntersectionType } from '@nestjs/swagger';

import { ExposureAdminAreaDto } from '@api-service/src/alerts/dto/exposure-admin-area.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class ExposureAdminAreaReadDto extends IntersectionType(
  BaseDto,
  ExposureAdminAreaDto,
) {}
