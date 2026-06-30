import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

import { LayerName } from '@api-service/src/shared-enums';

export class ExposureAdminAreaDto {
  @ApiProperty({ example: 'KEN_01_001' })
  @IsString()
  public readonly placeCode: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  public readonly adminLevel: number;

  @ApiProperty({
    enum: LayerName,
    example: LayerName.populationExposed,
  })
  @IsEnum(LayerName)
  public readonly layer: LayerName;

  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly value: number;
}
