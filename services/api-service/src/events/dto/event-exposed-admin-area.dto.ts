import { ApiProperty } from '@nestjs/swagger';

import { Layer, MeasurementUnits } from '@api-service/src/shared-enums';

class AdminAreaExposureDto {
  @ApiProperty({ enum: Layer, example: Layer.populationExposed })
  public readonly type: Layer;

  @ApiProperty({ enum: MeasurementUnits, example: MeasurementUnits.People })
  public readonly unit: MeasurementUnits;

  @ApiProperty({ example: 20_000 })
  public readonly total: number;

  @ApiProperty({ example: 5_000 })
  public readonly exposed: number;
}

export class ExposedAdminAreaDto {
  @ApiProperty({ example: 'KEN_01_001' })
  public readonly placeCode: string;

  @ApiProperty({ example: 1 })
  public readonly adminLevel: number;

  public readonly name: string;

  @ApiProperty({ type: [AdminAreaExposureDto] })
  public readonly exposure: AdminAreaExposureDto[];
}
