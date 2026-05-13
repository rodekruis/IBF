import { OmitType, PartialType } from '@nestjs/swagger';

import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';

export class AdminAreaUpdateDto extends PartialType(
  OmitType(AdminAreaCreateDto, ['placeCode'] as const),
) {}
