import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class CentroidDto {
  @ApiProperty({ example: 0.35 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  public readonly latitude: number;

  @ApiProperty({ example: 32.6 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  public readonly longitude: number;
}
