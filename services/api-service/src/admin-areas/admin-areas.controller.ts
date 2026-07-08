import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Feature, FeatureCollection } from 'geojson';

import { AdminAreasService } from '@api-service/src/admin-areas/admin-areas.service';
import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';
import { GeoJsonFeatureDto } from '@api-service/src/admin-areas/dto/geojson-feature.dto';
import { GeoJsonFeatureCollectionDto } from '@api-service/src/admin-areas/dto/geojson-feature-collection.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('admin-areas')
@UseGuards(AuthenticatedUserGuard)
@Controller('admin-areas')
export class AdminAreasController {
  public constructor(private readonly adminAreasService: AdminAreasService) {}

  // TODO: Re-add @ApiQuery decorators once we have clarity on which pg_featureserv params to expose
  @Get()
  @ApiOperation({
    summary:
      'Get admin areas; all pg_featureserv query parameters are supported (not shown in Swagger UI, so calling via Swagger is limited)',
    description:
      "Example current use: GET /admin-areas?filter=countryCodeIso3='ETH' AND adminLevel=2",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GeoJSON FeatureCollection of admin areas',
    type: GeoJsonFeatureCollectionDto,
  })
  public async getAdminAreas(
    @Query() query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.adminAreasService.getAdminAreas(query);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create one or more admin areas.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Admin areas created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Admin area already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country does not exist',
  })
  public async createAdminAreas(
    @Body(new ParseArrayPipe({ items: AdminAreaCreateDto }))
    dtos: AdminAreaCreateDto[],
  ): Promise<void> {
    await this.adminAreasService.createAdminAreas(dtos);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Patch(':placeCode')
  @ApiOperation({
    summary: 'Update an admin area',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin area updated successfully',
    type: GeoJsonFeatureDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Admin area not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country does not exist',
  })
  public async updateAdminArea(
    @Param('placeCode') placeCode: string,
    @Body() adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<Feature> {
    return this.adminAreasService.updateAdminAreaOrThrow(
      placeCode,
      adminAreaUpdateDto,
    );
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':placeCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an admin area',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Admin area deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Admin area not found',
  })
  public async deleteAdminArea(
    @Param('placeCode') placeCode: string,
  ): Promise<void> {
    await this.adminAreasService.deleteAdminAreaOrThrow(placeCode);
  }
}
