import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsString, ValidateNested } from 'class-validator';

import { LeadTimeDto } from '@api-service/src/alerts/dto/lead-time.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';

export class SeverityEntryDto {
  // TODO: re-evaluate name 'leadTime' throughout.
  @ApiProperty({ type: LeadTimeDto })
  @ValidateNested()
  @Type(() => LeadTimeDto)
  public readonly leadTime: LeadTimeDto;

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
