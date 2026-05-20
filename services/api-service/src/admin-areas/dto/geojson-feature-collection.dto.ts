import { ApiProperty } from '@nestjs/swagger';
import type { FeatureCollection, Geometry } from 'geojson';

import { GeoJsonFeatureDto } from '@api-service/src/admin-areas/dto/geojson-feature.dto';

export class GeoJsonFeatureCollectionDto implements FeatureCollection<Geometry | null> {
  @ApiProperty({ enum: ['FeatureCollection'] })
  public readonly type: 'FeatureCollection';

  @ApiProperty({ type: () => [GeoJsonFeatureDto] })
  public readonly features: GeoJsonFeatureDto[];
}
