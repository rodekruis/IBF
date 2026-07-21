import { ApiProperty } from '@nestjs/swagger';

import { LayerName, LayerType } from '@api-service/src/shared-enums';

export class CountryLayerDto {
  @ApiProperty({ enum: LayerName })
  public readonly name: LayerName;

  @ApiProperty({ enum: LayerType })
  public readonly type: LayerType;

  @ApiProperty({ example: 'Population' })
  public readonly label: string;
}
