import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Feature, FeatureCollection } from 'geojson';

import { GeoJsonFeatureDto } from '@api-service/src/admin-areas/dto/geojson-feature.dto';
import { GeoJsonFeatureCollectionDto } from '@api-service/src/admin-areas/dto/geojson-feature-collection.dto';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeaturesService } from '@api-service/src/geo-features/geo-features.service';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('geo-features')
@Controller('geo-features')
export class GeoFeaturesController {
  public constructor(private readonly geoFeaturesService: GeoFeaturesService) {}

  // TODO: Re-add @ApiQuery decorators once we have clarity on which pg_featureserv params to expose
  @Get()
  @ApiOperation({
    summary:
      'Get geo-features; all pg_featureserv query parameters are supported (not shown in Swagger UI, so calling via Swagger is limited)',
    description:
      "Example current use: GET /geo-features?filter=countryCodeIso3='ETH' AND layer='glofasStations'",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GeoJSON FeatureCollection of geo-features',
    type: GeoJsonFeatureCollectionDto,
  })
  public async getGeoFeatures(
    @Query() query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.geoFeaturesService.getGeoFeatures(query);
  }

  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create one or more geo-features. Admin endpoint for managing configuration.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Geo-features created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Geo-feature with the same country, layer and referenceId already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country does not exist',
  })
  public async createGeoFeatures(
    @Body(new ParseArrayPipe({ items: GeoFeatureCreateDto }))
    dtos: GeoFeatureCreateDto[],
  ): Promise<void> {
    await this.geoFeaturesService.createGeoFeatures(dtos);
  }

  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a geo-feature. Admin endpoint for managing configuration.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Geo-feature updated successfully',
    type: GeoJsonFeatureDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Geo-feature not found',
  })
  public async updateGeoFeature(
    @Param('id', ParseIntPipe) id: number,
    @Body() geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<Feature> {
    return this.geoFeaturesService.updateGeoFeatureOrThrow(
      id,
      geoFeatureUpdateDto,
    );
  }

  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a geo-feature. Admin endpoint for managing configuration.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Geo-feature deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Geo-feature not found',
  })
  public async deleteGeoFeature(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.geoFeaturesService.deleteGeoFeatureOrThrow(id);
  }
}
