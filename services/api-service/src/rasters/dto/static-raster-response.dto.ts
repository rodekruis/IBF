import { ApiProperty } from '@nestjs/swagger';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { Layer } from '@api-service/src/shared-enums';

export class StaticRasterResponseDto {
  @ApiProperty({ example: 1 })
  public readonly id: number;

  @ApiProperty({ enum: Layer, example: Layer.population })
  public readonly layer: Layer;

  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;
}
