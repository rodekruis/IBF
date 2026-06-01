import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

import { Layer } from '@api-service/src/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
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
