import {
  GeoJsonFeatureCollectionDtoOf,
  GeoJsonFeatureDto,
} from '@api-service/src/admin-areas/dto/geojson-feature.dto';

export class GeoJsonFeatureCollectionDto extends GeoJsonFeatureCollectionDtoOf(
  GeoJsonFeatureDto,
) {}
