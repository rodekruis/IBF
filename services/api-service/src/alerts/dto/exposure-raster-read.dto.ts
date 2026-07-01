import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { RasterMetadataDto } from '@api-service/src/alerts/dto/raster-metadata.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class ExposureRasterReadDto extends IntersectionType(BaseDto) {
  @ApiProperty({ enum: LayerName, example: LayerName.floodDepth })
  public readonly layer: LayerName;

  @ApiProperty({ type: RasterMetadataDto })
  @ValidateNested()
  @Type(() => RasterMetadataDto)
  public readonly metadata: RasterMetadataDto;
}
