import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { HazardType, LayerType } from '@api-service/src/shared-enums';

export class LayerUpdateDto {
  @ApiProperty({ required: false, example: 'Population' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  public readonly label?: string;

  @ApiProperty({ required: false, enum: LayerType })
  @IsEnum(LayerType)
  @IsOptional()
  public readonly type?: LayerType;

  @ApiProperty({ required: false, enum: HazardType })
  @IsEnum(HazardType)
  @IsOptional()
  public readonly hazardType?: HazardType | null;

  @ApiProperty({ required: false, example: 'Population density raster' })
  @IsString()
  @IsOptional()
  public readonly description?: string;
}
