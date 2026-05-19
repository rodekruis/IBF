import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class AdminAreaCreateDto {
  @ApiProperty({ example: 'KE030' })
  @IsString()
  public readonly placeCode: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  public readonly adminLevel: number;

  @ApiProperty({ example: 'Nairobi' })
  @IsString()
  public readonly nameEn: string;

  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiPropertyOptional({
    example: { ADM0_PCODE: 'KEN' },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  public readonly attributes?: Record<string, string> | null;

  @ApiProperty({ example: { type: 'Feature', geometry: {}, properties: {} } })
  @IsObject()
  public readonly geometry: Record<string, unknown>;
}
