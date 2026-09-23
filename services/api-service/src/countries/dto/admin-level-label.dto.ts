import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AdminLevelLabelDto {
  @ApiProperty({ example: 'County' })
  @IsString()
  public readonly singular: string;

  @ApiProperty({ example: 'Counties' })
  @IsString()
  public readonly plural: string;
}
