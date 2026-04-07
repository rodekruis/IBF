import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class AdminAreaExposureDto {
  @ApiProperty({ example: 'KEN_01_001' })
  @IsString()
  public readonly placeCode: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  public readonly adminLevel: number;

  @ApiProperty({ enum: Layer, example: Layer.populationExposed })
  @IsEnum(Layer)
  public readonly layer: Layer;

  @ApiProperty({ example: 1 })
  @IsNumber()
  public readonly value: number;
}

export class ReadAdminAreaExposureDto extends IntersectionType(
  BaseDto,
  AdminAreaExposureDto,
) {}
