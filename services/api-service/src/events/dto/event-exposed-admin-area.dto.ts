import { ApiProperty } from '@nestjs/swagger';

import { Layer } from '@api-service/src/alerts/enum/layer.enum';

class AdminAreaExposureDto {
  @ApiProperty({ enum: Layer, example: Layer.populationExposed })
  public readonly type: Layer;

  @ApiProperty({ example: 48400 })
  public readonly exposed: number;
}

export class ExposedAdminAreaDto {
  @ApiProperty({ example: 'KEN_01_001' })
  public readonly placeCode: string;

  @ApiProperty({ example: 1 })
  public readonly adminLevel: number;

  @ApiProperty({ type: [AdminAreaExposureDto] })
  public readonly exposure: AdminAreaExposureDto[];
}
