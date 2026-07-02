import { ApiProperty } from '@nestjs/swagger';

import { RasterMetadataDto } from '@api-service/src/alerts/dto/raster-metadata.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class StaticRasterResponseDto {
  @ApiProperty({ example: 1 })
  public readonly id: number;

  @ApiProperty({ enum: LayerName, example: LayerName.population })
  public readonly layer: LayerName;

  @ApiProperty({ type: RasterMetadataDto })
  public readonly metadata: RasterMetadataDto;
}
