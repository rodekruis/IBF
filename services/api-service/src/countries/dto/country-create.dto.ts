import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CountryCreateDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiProperty({ example: 'KE' })
  @IsString()
  public readonly countryCodeIso2: string;

  @ApiProperty({ example: 'Kenya' })
  @IsString()
  public readonly countryName: string;
}
