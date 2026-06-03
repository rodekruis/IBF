import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsString, ValidateNested } from 'class-validator';

import { TimeIntervalDto } from '@api-service/src/alerts/dto/time-interval.dto';
import { EnsembleMemberType } from '@api-service/src/shared-enums';

// The data pipelines also use this definition.
// If you make changes here, also update the data class in data/pipelines/infra/data_types/dtos.py
export class SeverityDto {
  @ApiProperty({ type: TimeIntervalDto })
  @ValidateNested()
  @Type(() => TimeIntervalDto)
  public readonly timeInterval: TimeIntervalDto;

  @ApiProperty({ example: EnsembleMemberType.median, enum: EnsembleMemberType })
  @IsEnum(EnsembleMemberType)
  public readonly ensembleMemberType: EnsembleMemberType;

  @ApiProperty({ example: 'water_discharge' })
  @IsString()
  public readonly severityKey: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  public readonly severityValue: number;
}
