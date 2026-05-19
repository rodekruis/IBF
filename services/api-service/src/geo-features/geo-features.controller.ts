import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
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
}
