import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsNumber } from 'class-validator';

import { EPSG } from '@api-service/src/shared/enum/epsg.enum';

export class StaticRasterSourceMetadataDto {
  @ApiProperty({
    description:
      'Affine geotransform of the data PNG: [xResolution, 0, xmin, 0, -yResolution, ymax]',
    example: [0.00083333333, 0, 29.573332495, 0, -0.00083333333, 4.219166986],
  })
  @IsArray()
  @ArrayMinSize(6)
  @IsNumber({}, { each: true })
  public readonly transform: number[];

  @ApiProperty({ enum: [EPSG.WGS84], example: EPSG.WGS84 })
  @IsIn([EPSG.WGS84])
  public readonly crs: EPSG;
}
