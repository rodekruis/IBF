import { Injectable } from '@nestjs/common';

import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
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
}
