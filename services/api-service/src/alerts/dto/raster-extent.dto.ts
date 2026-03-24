import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class RasterExtentDto {
  @ApiProperty({ example: 33.5 })
  @IsNumber()
  public readonly xmin: number;

  @ApiProperty({ example: -1.5 })
  @IsNumber()
  public readonly ymin: number;

  @ApiProperty({ example: 42.0 })
  @IsNumber()
  public readonly xmax: number;

  @ApiProperty({ example: 5.5 })
  @IsNumber()
  public readonly ymax: number;
}
