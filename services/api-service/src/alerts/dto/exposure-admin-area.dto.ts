import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

import { ExposureIndicator } from '@api-service/src/shared-enums';

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

  @ApiProperty({
    enum: ExposureIndicator,
    example: ExposureIndicator.populationExposed,
  })
  @IsEnum(ExposureIndicator)
  public readonly exposureIndicator: ExposureIndicator;

  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly value: number;
}
