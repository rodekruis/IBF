import { IntersectionType } from '@nestjs/swagger';

import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class CountryResponseDto extends IntersectionType(
  BaseDto,
  CountryCreateDto,
) {}
