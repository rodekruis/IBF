import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class LeadTimeDto {
  @ApiProperty({ example: '2026-03-20T00:00:00Z' })
  @IsISO8601()
  public readonly start: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  @IsISO8601()
  public readonly end: string;
}
