import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class ClassLevelDto {
  @ApiProperty({ example: 'high' })
  @IsString()
  public readonly label: string;

  @ApiProperty({ example: 400 })
  @IsNumber()
  public readonly threshold: number;
}
