import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import {
  ExposureDto,
  ReadExposureDto,
} from '@api-service/src/alerts/dto/exposure.dto';
import {
  ReadSeverityDto,
  SeverityDto,
} from '@api-service/src/alerts/dto/severity.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class CreateAlertDto {
  @ApiProperty({ example: 'KEN-flood-2026-03-20' })
  @IsString()
  public readonly alertName: string;

  @ApiProperty({ example: '2026-03-20T12:00:00Z' })
  @IsDate()
  @Type(() => Date)
  public readonly issuedAt: Date;

  @ApiProperty({ type: CentroidDto })
  @ValidateNested()
  @Type(() => CentroidDto)
  public readonly centroid: CentroidDto;

  @ApiProperty({
    enum: HazardType,
    isArray: true,
    example: [HazardType.floods],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(HazardType, { each: true })
  public readonly hazardTypes: HazardType[];

  @ApiProperty({
    enum: ForecastSource,
    isArray: true,
    example: [ForecastSource.glofas],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ForecastSource, { each: true })
  public readonly forecastSources: ForecastSource[];

  @ApiProperty({
    type: [SeverityDto],
    example: [
      {
        timeInterval: {
          start: '2026-03-20T00:00:00Z',
          end: '2026-03-20T23:59:59Z',
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        timeInterval: {
          start: '2026-03-20T00:00:00Z',
          end: '2026-03-20T23:59:59Z',
        },
        ensembleMemberType: EnsembleMemberType.run,
        severityKey: 'water_discharge',
        severityValue: 135.0,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeverityDto)
  public readonly severity: SeverityDto[];

  @ApiProperty({ type: ExposureDto })
  @ValidateNested()
  @Type(() => ExposureDto)
  public readonly exposure: ExposureDto;
}

export class ReadAlertDto extends IntersectionType(BaseDto, CreateAlertDto) {
  @ApiProperty({ type: [ReadSeverityDto] })
  @Type(() => ReadSeverityDto)
  declare public readonly severity: ReadSeverityDto[];

  @ApiProperty({ type: ReadExposureDto })
  @Type(() => ReadExposureDto)
  declare public readonly exposure: ReadExposureDto;
}
