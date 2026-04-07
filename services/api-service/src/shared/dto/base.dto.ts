import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber } from 'class-validator';

export class BaseDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly id: number;

  @ApiProperty({ example: '2023-10-05T14:48:00.000Z' })
  @IsISO8601()
  public readonly created: Date;

  @ApiProperty({ example: '2023-10-05T14:48:00.000Z' })
  @IsISO8601()
  public readonly updated: Date;
}
