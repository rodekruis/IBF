import { ApiProperty } from '@nestjs/swagger';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { MapLayer } from '@api-service/src/shared-enums';

export class StaticRasterResponseDto {
  @ApiProperty({ example: 1 })
  public readonly id: number;

  @ApiProperty({ enum: MapLayer, example: MapLayer.population })
  public readonly mapLayer: MapLayer;

  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;
}
