import { AdminAreaPropertiesDto } from '@api-service/src/admin-areas/dto/admin-area-properties.dto';
import {
  GeoJsonFeatureCollectionDtoOf,
  GeoJsonFeatureDtoOf,
} from '@api-service/src/admin-areas/dto/geojson-feature.dto';

export class AdminAreaFeatureDto extends GeoJsonFeatureDtoOf(
  AdminAreaPropertiesDto,
) {}

export class AdminAreaFeatureCollectionDto extends GeoJsonFeatureCollectionDtoOf(
  AdminAreaFeatureDto,
) {}
