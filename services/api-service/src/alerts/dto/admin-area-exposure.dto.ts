import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Min } from 'class-validator';

export class AdminAreaExposureDto {
  @ApiProperty({ example: 'KEN_01_001' })
  @IsString()
  public readonly placeCode: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  public readonly adminLevel: number;

  @ApiProperty({ example: 'population_exposed' })
  @IsString()
  public readonly layer: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly value: number;
}
