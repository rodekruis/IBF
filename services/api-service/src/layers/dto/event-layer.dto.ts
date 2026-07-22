import { ApiProperty } from '@nestjs/swagger';

import { CountryLayerDto } from '@api-service/src/layers/dto/country-layer.dto';

export class EventLayerDto extends CountryLayerDto {
  @ApiProperty({
    description: 'ID that can be used to fetch the actual map layer data',
  })
  public readonly resourceId: string;
}
