import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class TimeIntervalDto {
  @ApiProperty({ example: '2026-03-20T00:00:00Z' })
  @IsDate()
  @Type(() => Date)
  public readonly start: Date;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  @IsDate()
  @Type(() => Date)
  public readonly end: Date;
}
