import { ApiProperty } from '@nestjs/swagger';

import { RasterMetadataDto } from '@api-service/src/alerts/dto/raster-metadata.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class AlertRasterResponseDto {
  @ApiProperty({ enum: LayerName, example: LayerName.floodDepth })
  public readonly layer: LayerName;

  @ApiProperty({ type: RasterMetadataDto })
  public readonly metadata: RasterMetadataDto;
}
