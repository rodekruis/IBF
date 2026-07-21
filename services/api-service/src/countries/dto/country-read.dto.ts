import { ApiProperty } from '@nestjs/swagger';

import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { CountryLayerDto } from '@api-service/src/layers/dto/country-layer.dto';

export class CountryReadDto extends CountryResponseDto {
  @ApiProperty({ type: [CountryLayerDto] })
  public readonly availableLayers: CountryLayerDto[];
}
