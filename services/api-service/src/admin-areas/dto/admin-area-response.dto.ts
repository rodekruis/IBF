import { IntersectionType } from '@nestjs/swagger';

import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class AdminAreaResponseDto extends IntersectionType(
  BaseDto,
  AdminAreaCreateDto,
) {}
