import { Injectable } from '@nestjs/common';
import type { Feature, FeatureCollection } from 'geojson';

import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeaturesRepository } from '@api-service/src/geo-features/geo-features.repository';

@Injectable()
export class GeoFeaturesService {
  public constructor(
    private readonly geoFeaturesRepository: GeoFeaturesRepository,
  ) {}

  public async getGeoFeatures(
    query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.geoFeaturesRepository.getGeoFeatures(query);
  }

  public async createGeoFeature(
    geoFeatureCreateDto: GeoFeatureCreateDto,
  ): Promise<Feature> {
    return this.geoFeaturesRepository.createGeoFeature(geoFeatureCreateDto);
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
