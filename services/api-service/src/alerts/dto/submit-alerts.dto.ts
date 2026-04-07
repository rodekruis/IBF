import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { CreateAlertDto } from '@api-service/src/alerts/dto/alert.dto';

export class SubmitAlertsDto {
  @ApiProperty({ type: [CreateAlertDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAlertDto)
  public readonly alerts: CreateAlertDto[];
}
