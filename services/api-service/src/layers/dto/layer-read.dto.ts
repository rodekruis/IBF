import { ApiProperty } from '@nestjs/swagger';

import {
  HazardType,
  LayerName,
  LayerType,
} from '@api-service/src/shared-enums';

export class LayerReadDto {
  @ApiProperty({ example: 1 })
  public readonly id: number;

  @ApiProperty({ enum: LayerName })
  public readonly name: LayerName;

  @ApiProperty({ example: 'Population' })
  public readonly label: string;

  @ApiProperty({ enum: LayerType })
  public readonly type: LayerType;

  @ApiProperty({ enum: HazardType, required: false, example: null })
  public readonly hazardType: HazardType | null;

  @ApiProperty({ example: null, required: false })
  public readonly description: string | null;
}
