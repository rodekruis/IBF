import { ApiProperty } from '@nestjs/swagger';

import { LayerName, LayerType } from '@api-service/src/shared-enums';

export class LayerDto {
  @ApiProperty({
    description: 'ID that can be used to fetch the actual map layer data',
  })
  public readonly resourceId: string;

  @ApiProperty({
    enum: LayerName,
    description:
      'The type of data on this layer. Used to label and style the layer in the UI.',
  })
  public readonly layer: LayerName;

  @ApiProperty({
    enum: LayerType,
    description: 'The way this data will be displayed',
  })
  public readonly format: LayerType;
}
