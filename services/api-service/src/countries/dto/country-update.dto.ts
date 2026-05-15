import { OmitType, PartialType } from '@nestjs/swagger';

import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';

export class CountryUpdateDto extends PartialType(
  OmitType(CountryCreateDto, ['countryCodeIso3'] as const),
) {}
