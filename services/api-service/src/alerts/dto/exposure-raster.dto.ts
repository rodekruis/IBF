import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { LayerName } from '@api-service/src/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class ExposureRasterDto {
  @ApiProperty({ enum: LayerName, example: LayerName.floodDepth })
  @IsEnum(LayerName)
  public readonly layer: LayerName;

  @ApiProperty({ example: 'base64-encoded-black-white-png' })
  @IsString()
  public readonly valueBlackWhite: string;

  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;
}
