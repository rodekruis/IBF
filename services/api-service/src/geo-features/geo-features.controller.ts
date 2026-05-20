import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Layer } from '@api-service/src/alerts/enum/shared-enums';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeaturesService } from '@api-service/src/geo-features/geo-features.service';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('geo-features')
@UseGuards(AuthenticatedUserGuard)
@Controller('geo-features')
export class GeoFeaturesController {
  public constructor(private readonly geoFeaturesService: GeoFeaturesService) {}

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get()
  @ApiOperation({
    summary: 'Get geo-features by country and/or layer',
  })
  @ApiQuery({ name: 'countryCodeIso3', required: false, example: 'KEN' })
  @ApiQuery({
    name: 'layer',
    required: false,
    enum: Layer,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Geo-features returned successfully',
    type: [GeoFeatureResponseDto],
  })
  public async getGeoFeatures(
    @Query('countryCodeIso3') countryCodeIso3?: string,
    @Query('layer') layer?: string,
  ): Promise<GeoFeatureResponseDto[]> {
    let layerValue: Layer | undefined = undefined;
    if (layer !== undefined) {
      if (Object.values(Layer).includes(layer as Layer)) {
        layerValue = layer as Layer;
      } else {
        throw new BadRequestException(
          `Invalid layer "${layer}". Valid values: ${Object.values(Layer).join(', ')}`,
        );
      }
    }

    return this.geoFeaturesService.getGeoFeatures({
      countryCodeIso3,
      layer: layerValue,
    });
  }

  // TODO: Consider adding a batch endpoint (POST with array body) for bulk imports
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @ApiOperation({
    summary: 'Create a geo-feature',
    description:
      'Not part of the current operational flow. Geo-features are currently seeded via /reset endpoint. This endpoint enables future manual data management by admins.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Geo-feature created successfully',
    type: GeoFeatureResponseDto,
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
  public async createGeoFeature(
    @Body() geoFeatureCreateDto: GeoFeatureCreateDto,
  ): Promise<GeoFeatureResponseDto> {
    return this.geoFeaturesService.createGeoFeature(geoFeatureCreateDto);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a geo-feature',
    description:
      'Not part of the current operational flow. Geo-features are currently seeded via /reset endpoint. This endpoint enables future manual data management by admins.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Geo-feature updated successfully',
    type: GeoFeatureResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Geo-feature not found',
  })
  public async updateGeoFeature(
    @Param('id', ParseIntPipe) id: number,
    @Body() geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<GeoFeatureResponseDto> {
    return this.geoFeaturesService.updateGeoFeatureOrThrow(
      id,
      geoFeatureUpdateDto,
    );
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a geo-feature',
    description:
      'Not part of the current operational flow. Geo-features are currently seeded via /reset endpoint. This endpoint enables future manual data management by admins.',
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
