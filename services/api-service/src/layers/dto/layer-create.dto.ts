import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import {
  HazardType,
  LayerName,
  LayerType,
} from '@api-service/src/shared-enums';

export class LayerCreateDto {
  @ApiProperty({ enum: LayerName })
  @IsEnum(LayerName)
  public readonly name: LayerName;

  @ApiProperty({ example: 'Population' })
  @IsString()
  @IsNotEmpty()
  public readonly label: string;

  @ApiProperty({ enum: LayerType })
  @IsEnum(LayerType)
  public readonly type: LayerType;

  @ApiProperty({ required: false, enum: HazardType })
  @IsEnum(HazardType)
  @IsOptional()
  public readonly hazardType?: HazardType;

  @ApiProperty({ required: false, example: 'Population density raster' })
  @IsString()
  @IsOptional()
  public readonly description?: string;
}
