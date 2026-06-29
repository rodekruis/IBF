import { ApiProperty } from '@nestjs/swagger';

import { MapLayer, MapLayerFormat } from '@api-service/src/shared-enums';

export class MapLayerDto {
  @ApiProperty({
    description: 'ID that can be used to fetch the actual map layer data',
  })
  public readonly resourceId: string;

  @ApiProperty({
    enum: MapLayer,
    description:
      'The type of data on this layer. Used to label and style the layer in the UI.',
  })
  public readonly mapLayer: MapLayer;

  @ApiProperty({
    enum: MapLayerFormat,
    description: 'The way this data will be displayed',
  })
  public readonly format: MapLayerFormat;
}
