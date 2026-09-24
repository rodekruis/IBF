import { Type } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

import { GeoJsonGeometryDto } from '@api-service/src/admin-areas/dto/geojson-geometry.dto';

// Swagger cannot express TypeScript generics, so these factories build concrete
// classes for a given properties class. Without a properties class the
// properties are documented as a free-form object.
export function GeoJsonFeatureDtoOf<TProperties extends GeoJsonProperties>(
  propertiesType?: Type<TProperties>,
): Type<Feature<Geometry | null, TProperties>> {
  class GeoJsonFeatureOfDto implements Feature<Geometry | null, TProperties> {
    @ApiProperty({ enum: ['Feature'] })
    public readonly type: 'Feature';

    @ApiProperty({ type: () => GeoJsonGeometryDto, nullable: true })
    public readonly geometry: Geometry | null;

    @ApiPropertyOptional({
      description: 'Feature identifier',
      example: 'KEN.10_1',
      oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    public readonly id?: string | number;

    @ApiProperty(
      propertiesType
        ? { type: () => propertiesType }
        : {
            description: 'Feature properties',
            example: { name: 'Nairobi', adminLevel: 1 },
            type: 'object',
            additionalProperties: true,
            nullable: true,
          },
    )
    public readonly properties: TProperties;
  }
  return GeoJsonFeatureOfDto;
}

export function GeoJsonFeatureCollectionDtoOf<
  TProperties extends GeoJsonProperties,
>(
  featureType: Type<Feature<Geometry | null, TProperties>>,
): Type<FeatureCollection<Geometry | null, TProperties>> {
  class GeoJsonFeatureCollectionOfDto implements FeatureCollection<
    Geometry | null,
    TProperties
  > {
    @ApiProperty({ enum: ['FeatureCollection'] })
    public readonly type: 'FeatureCollection';

    @ApiProperty({ type: () => [featureType] })
    public readonly features: Feature<Geometry | null, TProperties>[];
  }
  return GeoJsonFeatureCollectionOfDto;
}

export class GeoJsonFeatureDto extends GeoJsonFeatureDtoOf() {}
