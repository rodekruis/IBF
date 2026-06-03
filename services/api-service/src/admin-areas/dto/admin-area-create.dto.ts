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

  @ApiPropertyOptional({ example: 'KE010', nullable: true })
  @IsOptional()
  @IsString()
  public readonly placeCodeLevel1?: string | null;

  @ApiPropertyOptional({ example: 'KE010222', nullable: true })
  @IsOptional()
  @IsString()
  public readonly placeCodeLevel2?: string | null;

  @ApiPropertyOptional({ example: 'KE010222333', nullable: true })
  @IsOptional()
  @IsString()
  public readonly placeCodeLevel3?: string | null;

  @ApiPropertyOptional({
    example: { POPULATION: 215293 },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  public readonly attributes?: Record<string, unknown> | null;

  @ApiProperty({ example: { type: 'Feature', geometry: {}, properties: {} } })
  @IsObject()
  public readonly geometry: Record<string, unknown>;
}
