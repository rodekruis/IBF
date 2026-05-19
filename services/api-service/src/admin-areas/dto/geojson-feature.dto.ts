import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Feature, Geometry } from 'geojson';

import { GeoJsonGeometryDto } from '@api-service/src/admin-areas/dto/geojson-geometry.dto';

export class GeoJsonFeatureDto implements Feature<Geometry | null> {
  @ApiProperty({ enum: ['Feature'] })
  public readonly type: 'Feature';

  @ApiProperty({ type: () => GeoJsonGeometryDto, nullable: true })
  public readonly geometry: Geometry | null;

  @ApiPropertyOptional({
    description: 'Feature identifier',
    example: 'KE030',
  })
  public readonly id?: string | number;

  @ApiProperty({
    description: 'Feature properties',
    example: { name: 'Nairobi', adminLevel: 1 },
    nullable: true,
  })
  public readonly properties: Record<string, unknown> | null;
}
