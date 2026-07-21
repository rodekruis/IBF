import { ApiProperty } from '@nestjs/swagger';

import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { LayerReadDto } from '@api-service/src/layers/dto/layer-read.dto';

export class CountryReadDto extends CountryResponseDto {
  @ApiProperty({ type: [LayerReadDto] })
  public readonly availableLayers: LayerReadDto[];
}
