import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

import { Layer } from '@api-service/src/alerts/enum/shared-enums';

export class ExposureAdminAreaDto {
  @ApiProperty({ example: 'KEN_01_001' })
  @IsString()
  public readonly placeCode: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  public readonly adminLevel: number;

  @ApiProperty({ enum: Layer, example: Layer.populationExposed })
  @IsEnum(Layer)
  public readonly layer: Layer;

  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly value: number;
}
