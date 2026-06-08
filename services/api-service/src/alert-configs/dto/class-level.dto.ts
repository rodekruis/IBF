import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber } from 'class-validator';

import { AlertClassificationLevel } from '@api-service/src/shared-enums';

export class ClassLevelDto {
  @ApiProperty({
    enum: AlertClassificationLevel,
    example: AlertClassificationLevel.High,
  })
  @IsEnum(AlertClassificationLevel)
  public readonly label: AlertClassificationLevel;

  @ApiProperty({ example: 400 })
  @IsNumber()
  public readonly threshold: number;
}
