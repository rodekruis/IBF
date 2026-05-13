import { IntersectionType } from '@nestjs/swagger';

import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class AlertConfigResponseDto extends IntersectionType(
  BaseDto,
  AlertConfigCreateDto,
) {}
