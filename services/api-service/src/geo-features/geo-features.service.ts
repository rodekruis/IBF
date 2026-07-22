import { Injectable } from '@nestjs/common';
import type { Feature, FeatureCollection } from 'geojson';

import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeaturesRepository } from '@api-service/src/geo-features/geo-features.repository';
import { LayersService } from '@api-service/src/layers/layers.service';
import { LayerName } from '@api-service/src/shared-enums';

@Injectable()
export class GeoFeaturesService {
  public constructor(
    private readonly geoFeaturesRepository: GeoFeaturesRepository,
    private readonly layersService: LayersService,
  ) {}

  // Translate legacy CQL filter `layer='<name>'` to `layerId=<id>` for pg_featureserv
  // TODO: when switching to dedicated query parameters instead of raw CQL, this can be better handled
  private async resolveLayerFilterInQuery(
    query: Record<string, string>,
  ): Promise<Record<string, string>> {
    const filter = query['filter'];
    if (!filter) {
      return query;
    }
    const layerMatch = filter.match(/layer\s*=\s*'([^']+)'/);
    if (!layerMatch) {
      return query;
    }
    const layerName = layerMatch[1] as LayerName;
    const allLayers = await this.layersService.getLayers();
    const layer = allLayers.find((l) => l.name === layerName);
    if (!layer) {
      return query;
    }
    return {
      ...query,
      filter: filter.replace(layerMatch[0], `layerId=${layer.id}`),
    };
  }

  public async getGeoFeatures(
    query: Record<string, string>,
  ): Promise<FeatureCollection> {
    const resolvedQuery = await this.resolveLayerFilterInQuery(query);
    return this.geoFeaturesRepository.getGeoFeatures(resolvedQuery);
  }

  public async createGeoFeatures(dtos: GeoFeatureCreateDto[]): Promise<void> {
    return this.geoFeaturesRepository.createGeoFeatures(dtos);
  }

  public async updateGeoFeatureOrThrow(
    id: number,
    geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<Feature> {
    return this.geoFeaturesRepository.updateGeoFeatureOrThrow(
      id,
      geoFeatureUpdateDto,
    );
  }

  public async deleteGeoFeatureOrThrow(id: number): Promise<void> {
    return this.geoFeaturesRepository.deleteGeoFeatureOrThrow(id);
  }
}
