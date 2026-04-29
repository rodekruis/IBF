import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ExposureDto } from '@api-service/src/alerts/dto/exposure.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';

export class AlertCreateDto {
  @ApiProperty({ example: 'KEN_floods_station-A' })
  @IsString()
  public readonly eventName: string;

  @ApiProperty({ type: CentroidDto })
  @ValidateNested()
  @Type(() => CentroidDto)
  public readonly centroid: CentroidDto;

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
