import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  ValidateNested,
} from 'class-validator';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  ForecastSource,
  HazardType,
} from '@api-service/src/alerts/enum/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class ForecastCreateDto {
  @ApiProperty({ example: '2026-03-20T12:00:00Z' })
  @IsDate()
  @Type(() => Date)
  public readonly issuedAt: Date;

  @ApiProperty({
    enum: HazardType,
    example: HazardType.floods,
  })
  @IsEnum(HazardType)
  public readonly hazardType: HazardType;

  @ApiProperty({
    enum: ForecastSource,
    isArray: true,
    example: [ForecastSource.glofas],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ForecastSource, { each: true })
  public readonly forecastSources: ForecastSource[];

  @ApiProperty({ type: [AlertCreateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlertCreateDto)
  public readonly alerts: AlertCreateDto[];
}
