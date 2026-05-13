import { Injectable } from '@nestjs/common';

import { CountriesRepository } from '@api-service/src/countries/countries.repository';
import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';
import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { CountryUpdateDto } from '@api-service/src/countries/dto/country-update.dto';

@Injectable()
export class CountriesService {
  public constructor(
    private readonly countriesRepository: CountriesRepository,
  ) {}

  public async getCountries(): Promise<CountryResponseDto[]> {
    return this.countriesRepository.getCountries();
  }

  public async getCountryOrThrow(
    countryCodeIso3: string,
  ): Promise<CountryResponseDto> {
    return this.countriesRepository.getCountryOrThrow(countryCodeIso3);
  }

  public async createCountry(
    countryCreateDto: CountryCreateDto,
  ): Promise<CountryResponseDto> {
    return this.countriesRepository.createCountry(countryCreateDto);
  }

  public async updateCountryOrThrow(
    countryCodeIso3: string,
    countryUpdateDto: CountryUpdateDto,
  ): Promise<CountryResponseDto> {
    return this.countriesRepository.updateCountryOrThrow(
      countryCodeIso3,
      countryUpdateDto,
    );
  }

  public async deleteCountryOrThrow(countryCodeIso3: string): Promise<void> {
    return this.countriesRepository.deleteCountryOrThrow(countryCodeIso3);
  }
}
