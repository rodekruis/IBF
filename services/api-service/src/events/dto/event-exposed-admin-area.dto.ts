import { ApiProperty } from '@nestjs/swagger';

import { ExposureIndicator } from '@api-service/src/shared-enums';

class AdminAreaExposureDto {
  @ApiProperty({
    enum: ExposureIndicator,
    example: ExposureIndicator.populationExposed,
  })
  public readonly exposureIndicator: ExposureIndicator;

  @ApiProperty({ example: 20_000 })
  public readonly total: number | null; // TODO, make non-nullable again when possible.

  @ApiProperty({ example: 5_000 })
  public readonly exposed: number;
}

export class ExposedAdminAreaDto {
  @ApiProperty({ example: 'KEN_01_001' })
  public readonly placeCode: string;

  @ApiProperty({ example: 1 })
  public readonly adminLevel: number;

  @ApiProperty({ example: 'Region A' })
  public readonly name: string;

  @ApiProperty({ type: [AdminAreaExposureDto] })
  public readonly exposure: AdminAreaExposureDto[];
}
