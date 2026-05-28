import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ExposureReadDto } from '@api-service/src/alerts/dto/exposure-read.dto';
import { SeverityReadDto } from '@api-service/src/alerts/dto/severity-read.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';
import { ForecastSource, HazardType } from '@api-service/src/shared-enums';

export class AlertReadDto extends IntersectionType(BaseDto, AlertCreateDto) {
  @ApiProperty()
  public readonly issuedAt: Date;

  @ApiProperty({ enum: HazardType })
  public readonly hazardType: HazardType;

  @ApiProperty({ enum: ForecastSource, isArray: true })
  public readonly forecastSources: ForecastSource[];

  @ApiProperty({ type: [SeverityReadDto] })
  @Type(() => SeverityReadDto)
  declare public readonly severity: SeverityReadDto[];

  @ApiProperty({ type: ExposureReadDto })
  @Type(() => ExposureReadDto)
  declare public readonly exposure: ExposureReadDto;
}
