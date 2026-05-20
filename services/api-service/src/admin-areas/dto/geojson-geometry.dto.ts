import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { GeoJsonObject } from 'geojson';

type SupportedGeometryTypes = 'Point' | 'Polygon' | 'MultiPolygon';

export class GeoJsonGeometryDto implements GeoJsonObject {
  @ApiProperty({
    example: 'Polygon',
    enum: [
      'Point',
      'Polygon',
      'MultiPolygon',
    ] satisfies SupportedGeometryTypes[],
  })
  public readonly type: SupportedGeometryTypes;

  @ApiPropertyOptional({
    description: 'Coordinates array; structure depends on geometry type.',
    example: [
      [
        [102.0, 0.0],
        [103.0, 1.0],
        [104.0, 0.0],
        [102.0, 0.0],
      ],
    ],
  })
  public readonly coordinates?: number[] | number[][][] | number[][][][];
}
