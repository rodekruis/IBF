import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { Layer } from '@api-service/src/alerts/enum/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class ExposureRasterDto {
  @ApiProperty({ enum: Layer, example: Layer.alertExtent })
  @IsEnum(Layer)
  public readonly layer: Layer;

  @ApiProperty({ example: 'base64-encoded-raster-data' })
  @IsString()
  public readonly value: string;

  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;
}
