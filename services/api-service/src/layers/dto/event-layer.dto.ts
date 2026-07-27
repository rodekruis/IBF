import { ApiProperty } from '@nestjs/swagger';

import { BaseLayerDto } from '@api-service/src/layers/dto/base-layer.dto';

export class EventLayerDto extends BaseLayerDto {
  @ApiProperty({
    description: 'ID that can be used to fetch the actual map layer data',
  })
  public readonly resourceId: string;
}
