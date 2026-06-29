import { OmitType, PartialType } from '@nestjs/swagger';

import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';

export class GeoFeatureUpdateDto extends PartialType(
  OmitType(GeoFeatureCreateDto, [
    'countryCodeIso3',
    'mapLayer',
    'referenceId',
  ] as const),
) {}
