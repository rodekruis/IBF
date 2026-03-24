import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ExposureDto } from '@api-service/src/alerts/dto/exposure.dto';
import { SeverityEntryDto } from '@api-service/src/alerts/dto/severity-entry.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';

export class CreateAlertDto {
  @ApiProperty({ example: 'KEN-flood-2026-03-20' })
  @IsString()
  public readonly alertName: string;

  @ApiProperty({ example: '2026-03-20T12:00:00Z' })
  @IsDateString()
  public readonly issuedAt: string;

  @ApiProperty({ type: CentroidDto })
  @ValidateNested()
  @Type(() => CentroidDto)
  public readonly centroid: CentroidDto;

  @ApiProperty({ example: ['floods'] })
  @IsArray()
  @IsString({ each: true })
  public readonly hazardTypes: string[];

  @ApiProperty({ example: ['glofas'] })
  @IsArray()
  @IsString({ each: true })
  public readonly forecastSources: string[];

  @ApiProperty({
    type: [SeverityEntryDto],
    example: [
      {
        leadTime: {
          start: '2026-03-20T00:00:00Z',
          end: '2026-03-20T23:59:59Z',
        },
        ensembleMemberType: EnsembleMemberType.median,
        severityKey: 'water_discharge',
        severityValue: 120.5,
      },
      {
        leadTime: {
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
  @Type(() => SeverityEntryDto)
  public readonly severityData: SeverityEntryDto[];

  @ApiProperty({ type: ExposureDto })
  @ValidateNested()
  @Type(() => ExposureDto)
  public readonly exposure: ExposureDto;
}
