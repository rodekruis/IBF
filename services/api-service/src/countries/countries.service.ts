import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import {
  CountriesRepository,
  CountryWithHazardTypes,
} from '@api-service/src/countries/countries.repository';
import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';
import { CountryReadDto } from '@api-service/src/countries/dto/country-read.dto';
import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { CountryUpdateDto } from '@api-service/src/countries/dto/country-update.dto';
import { LayerReadDto } from '@api-service/src/layers/dto/layer-read.dto';
import { LayersService } from '@api-service/src/layers/layers.service';

@Injectable()
export class CountriesService {
  public constructor(
    private readonly countriesRepository: CountriesRepository,
    private readonly layersService: LayersService,
  ) {}

  public async getCountries(): Promise<CountryReadDto[]> {
    return this.getCountriesWithLayers();
  }

  // Fetch countries (with hazard types) and all layers separately and combine for filtering
  private async getCountriesWithLayers(): Promise<CountryReadDto[]> {
    const countries =
      await this.countriesRepository.getCountriesWithHazardTypes();
    const allLayers = await this.layersService.getLayers();
    return countries.map((country) =>
      this.addAvailableLayersByCountry(country, allLayers),
    );
  }

  private addAvailableLayersByCountry(
    country: CountryWithHazardTypes,
    allLayers: LayerReadDto[],
  ): CountryReadDto {
    return {
      ...country,
      availableLayers: allLayers.filter(
        (layer) =>
          layer.hazardType === null ||
          country.hazardTypes.includes(layer.hazardType),
      ),
    };
  }

  public async getCountryOrThrow(
    countryCodeIso3: string,
  ): Promise<CountryReadDto> {
    const countries = await this.getCountriesWithLayers();
    const country = countries.find(
      (c) => c.countryCodeIso3 === countryCodeIso3,
    );
    if (!country) {
      throw new HttpException(
        `Country with code ${countryCodeIso3} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    return country;
  }

  public async createCountries(
    dtos: CountryCreateDto[],
  ): Promise<CountryResponseDto[]> {
    return this.countriesRepository.createCountries(dtos);
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
