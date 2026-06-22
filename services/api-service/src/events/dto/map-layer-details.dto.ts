import { ApiProperty } from '@nestjs/swagger';

import { LayerName, MapLayerDisplayType } from '@api-service/src/shared-enums';

export class MapLayerDetailsDto {
  @ApiProperty({
    description: 'ID that can be used to fetch the actual map layer data',
  })
  public readonly resourceId: string;

  @ApiProperty({
    enum: LayerName,
    description:
      'The type of data on this layer. Used to label and style the layer in the UI.',
  })
  public readonly dataType: LayerName;

  @ApiProperty({
    enum: MapLayerDisplayType,
    description: 'The way this data will be displayed',
  })
  public readonly displayType: MapLayerDisplayType;
}
