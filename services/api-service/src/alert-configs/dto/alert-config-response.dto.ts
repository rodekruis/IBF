import { ApiProperty } from '@nestjs/swagger';

export class AlertConfigResponseDto {
  @ApiProperty()
  public readonly id: number;

  @ApiProperty()
  public readonly countryCodeIso3: string;

  @ApiProperty()
  public readonly hazardType: string;

  @ApiProperty()
  public readonly spatialExtentName: string;

  @ApiProperty({ type: [String] })
  public readonly spatialExtentPlaceCodes: string[];

  @ApiProperty()
  public readonly temporalExtents: Record<string, string[]>[];
}
