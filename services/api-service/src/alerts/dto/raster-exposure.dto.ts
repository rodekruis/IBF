import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';

export class RasterExposureDto {
  @ApiProperty({ example: Layer.alertExtent })
  @IsString()
  public readonly layer: string;

  @ApiProperty({ example: 'base64-encoded-raster-data' })
  @IsString()
  public readonly value: string;

  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;
}
