import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

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
