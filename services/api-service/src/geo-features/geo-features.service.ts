import { Injectable } from '@nestjs/common';

import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeaturesRepository } from '@api-service/src/geo-features/geo-features.repository';

@Injectable()
export class GeoFeaturesService {
  public constructor(
    private readonly geoFeaturesRepository: GeoFeaturesRepository,
  ) {}

  public async getGeoFeatures({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3?: string;
    layer?: string;
  }): Promise<GeoFeatureResponseDto[]> {
    return this.geoFeaturesRepository.getGeoFeatures({
      countryCodeIso3,
      layer,
    });
  }

  public async createGeoFeature(
    geoFeatureCreateDto: GeoFeatureCreateDto,
  ): Promise<GeoFeatureResponseDto> {
    return this.geoFeaturesRepository.createGeoFeature(geoFeatureCreateDto);
  }

  public async updateGeoFeatureOrThrow(
    id: number,
    geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<GeoFeatureResponseDto> {
    return this.geoFeaturesRepository.updateGeoFeatureOrThrow(
      id,
      geoFeatureUpdateDto,
    );
  }

  public async deleteGeoFeatureOrThrow(id: number): Promise<void> {
    return this.geoFeaturesRepository.deleteGeoFeatureOrThrow(id);
  }
}
