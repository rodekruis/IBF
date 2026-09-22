import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminAreaAttributesDto {
  @ApiPropertyOptional({ example: 215293 })
  public readonly POPULATION?: number;
}

export class AdminAreaPropertiesDto {
  @ApiProperty({ example: 11430 })
  public readonly id: number;

  @ApiProperty({ example: 'KEN.10_1' })
  public readonly placeCode: string;

  @ApiProperty({ example: 1 })
  public readonly adminLevel: number;

  @ApiProperty({ example: 'Nairobi' })
  public readonly nameEn: string;

  @ApiProperty({ example: 'KEN' })
  public readonly countryCodeIso3: string;

  @ApiProperty({ example: 'KE' })
  public readonly placeCodeLevel0: string;

  @ApiProperty({ example: 'KEN.10_1', nullable: true, type: String })
  public readonly placeCodeLevel1: string | null;

  @ApiProperty({ example: 'KEN.10.1_1', nullable: true, type: String })
  public readonly placeCodeLevel2: string | null;

  @ApiProperty({ example: 'KEN.10.1.1_1', nullable: true, type: String })
  public readonly placeCodeLevel3: string | null;

  @ApiProperty({ example: 'KEN.10.1.1.1_1', nullable: true, type: String })
  public readonly placeCodeLevel4: string | null;

  @ApiProperty({ type: () => AdminAreaAttributesDto })
  public readonly attributes: AdminAreaAttributesDto;

  @ApiProperty({ example: '2026-09-21 10:16:32.766' })
  public readonly created: string;

  @ApiProperty({ example: '2026-09-21 10:16:32.766' })
  public readonly updated: string;
}
