import { ApiProperty } from '@nestjs/swagger';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { Layer } from '@api-service/src/shared-enums';

export class RasterResponseDto {
  @ApiProperty({ enum: Layer, example: Layer.alertExtent })
  public readonly layer: Layer;

  @ApiProperty({ example: 'base64-encoded-coloured-png' })
  public readonly valueColoured: string;

  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;
}
