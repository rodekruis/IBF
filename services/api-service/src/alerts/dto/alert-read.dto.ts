import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ExposureReadDto } from '@api-service/src/alerts/dto/exposure-read.dto';
import { SeverityReadDto } from '@api-service/src/alerts/dto/severity-read.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';
import { ForecastSource, HazardType } from '@api-service/src/shared-enums';

export class AlertReadDto extends IntersectionType(BaseDto) {
  @ApiProperty({ example: 'KEN' })
  public readonly countryCodeIso3: string;

  @ApiProperty({ example: 'station-A' })
  public readonly eventName: string;

  @ApiProperty()
  public readonly issuedAt: Date;

  @ApiProperty({ type: CentroidDto })
  @Type(() => CentroidDto)
  public readonly centroid: CentroidDto;

  @ApiProperty({ enum: HazardType })
  public readonly hazardType: HazardType;

  @ApiProperty({ enum: ForecastSource, isArray: true })
  public readonly forecastSources: ForecastSource[];

  @ApiProperty({ type: [SeverityReadDto] })
  @Type(() => SeverityReadDto)
  public readonly severity: SeverityReadDto[];

  @ApiProperty({ type: ExposureReadDto })
  @Type(() => ExposureReadDto)
  public readonly exposure: ExposureReadDto;
}
