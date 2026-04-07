import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class RasterExposureDto {
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

export class ReadRasterExposureDto extends IntersectionType(
  BaseDto,
  RasterExposureDto,
) {}
