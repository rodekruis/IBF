import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CountriesService } from '@api-service/src/countries/countries.service';
import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';
import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { CountryUpdateDto } from '@api-service/src/countries/dto/country-update.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('countries')
@UseGuards(AuthenticatedUserGuard)
@Controller('countries')
export class CountriesController {
  public constructor(private readonly countriesService: CountriesService) {}

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get()
  @ApiOperation({ summary: 'Get all countries' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Countries returned successfully',
    type: [CountryResponseDto],
  })
  public async getCountries(): Promise<CountryResponseDto[]> {
    return this.countriesService.getCountries();
  }

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get(':countryCodeIso3')
  @ApiOperation({ summary: 'Get country by ISO3 code' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Country returned successfully',
    type: CountryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Country not found',
  })
  public async getCountry(
    @Param('countryCodeIso3') countryCodeIso3: string,
  ): Promise<CountryResponseDto> {
    return this.countriesService.getCountryOrThrow(countryCodeIso3);
  }

  // TODO: Consider adding a batch endpoint (POST with array body) for bulk imports
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @ApiOperation({ summary: 'Create a country' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Country created successfully',
    type: CountryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Country already exists',
  })
  public async createCountry(
    @Body() countryCreateDto: CountryCreateDto,
  ): Promise<CountryResponseDto> {
    return this.countriesService.createCountry(countryCreateDto);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Patch(':countryCodeIso3')
  @ApiOperation({ summary: 'Update a country' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Country updated successfully',
    type: CountryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Country not found',
  })
  public async updateCountry(
    @Param('countryCodeIso3') countryCodeIso3: string,
    @Body() countryUpdateDto: CountryUpdateDto,
  ): Promise<CountryResponseDto> {
    return this.countriesService.updateCountryOrThrow(
      countryCodeIso3,
      countryUpdateDto,
    );
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':countryCodeIso3')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a country' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Country deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Country not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country is still referenced by other records',
  })
  public async deleteCountry(
    @Param('countryCodeIso3') countryCodeIso3: string,
  ): Promise<void> {
    await this.countriesService.deleteCountryOrThrow(countryCodeIso3);
  }
}
