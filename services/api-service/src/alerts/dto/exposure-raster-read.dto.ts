import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';
import { Layer } from '@api-service/src/shared-enums';

export class ExposureRasterReadDto extends IntersectionType(BaseDto) {
  @ApiProperty({ enum: Layer, example: Layer.alertExtent })
  public readonly layer: Layer;

  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;
}
