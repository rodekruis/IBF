import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber } from 'class-validator';

export class BaseDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly id: number;

  @ApiProperty({ example: '2023-10-05T14:48:00.000Z' })
  @IsDate()
  @Type(() => Date)
  public readonly created: Date;

  @ApiProperty({ example: '2023-10-05T14:48:00.000Z' })
  @IsDate()
  @Type(() => Date)
  public readonly updated: Date;
}
