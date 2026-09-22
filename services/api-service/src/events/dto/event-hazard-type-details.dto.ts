import { ApiPropertyOptional } from '@nestjs/swagger';
import { HazardType } from '@prisma/client';

import { EventFloodsDetailsDto } from '@api-service/src/events/dto/event-floods-details.dto';

export class EventHazardTypeDetailsDto {
  @ApiPropertyOptional({ type: EventFloodsDetailsDto })
  public readonly [HazardType.floods]?: EventFloodsDetailsDto;
}
