import { ApiProperty } from '@nestjs/swagger';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class RasterResponseDto {
  @ApiProperty({ enum: LayerName, example: LayerName.alertExtent })
  public readonly layer: LayerName;

  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;
}
