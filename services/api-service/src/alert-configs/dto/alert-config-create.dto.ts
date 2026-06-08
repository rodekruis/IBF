import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { AlertClass, HazardType } from '@api-service/src/shared-enums';

export class AlertConfigCreateDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiProperty({ enum: HazardType, example: HazardType.floods })
  @IsEnum(HazardType)
  public readonly hazardType: HazardType;

  @ApiProperty({ example: 'G5142' })
  @IsString()
  public readonly spatialExtentName: string;

  @ApiProperty({ type: [String], example: ['KE030'] })
  @IsArray()
  @IsString({ each: true })
  public readonly spatialExtentPlaceCodes: string[];

  @ApiProperty({
    example: [
      {
        'lead-time-spectrum': [
          '0-day',
          '1-day',
          '2-day',
          '3-day',
          '4-day',
          '5-day',
          '6-day',
          '7-day',
        ],
      },
    ],
  })
  @IsArray()
  @IsObject({ each: true })
  public readonly temporalExtents: Record<string, string[] | number[]>[];

  @ApiProperty({
    type: [ClassLevelDto],
    example: [
      { label: 'low', threshold: 100 },
      { label: 'med', threshold: 200 },
      { label: 'high', threshold: 400 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassLevelDto)
  public readonly severityClassLevels: ClassLevelDto[];

  @ApiProperty({
    type: [ClassLevelDto],
    example: [
      { label: 'low', threshold: 0.5 },
      { label: 'med', threshold: 0.65 },
      { label: 'high', threshold: 0.85 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassLevelDto)
  public readonly probabilityClassLevels: ClassLevelDto[];

  @ApiPropertyOptional({ example: 'high' })
  @IsOptional()
  @IsString()
  public readonly triggerAlertClass?: AlertClass | null;

  @ApiPropertyOptional({ example: 'P7D' })
  @IsOptional()
  @IsString()
  public readonly triggerLeadTimeDuration?: string | null;
}
