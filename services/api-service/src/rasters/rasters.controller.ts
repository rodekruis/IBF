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
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';

import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';
import { AlertRasterResponseDto } from '@api-service/src/rasters/dto/alert-raster-response.dto';
import { StaticRasterResponseDto } from '@api-service/src/rasters/dto/static-raster-response.dto';
import { StaticRasterUploadDto } from '@api-service/src/rasters/dto/static-raster-upload.dto';
import { RastersService } from '@api-service/src/rasters/rasters.service';
import { MapLayer } from '@api-service/src/shared-enums';

@ApiTags('rasters')
@Controller('rasters')
export class RastersController {
  public constructor(private readonly rastersService: RastersService) {}

  private parseMapLayerOrThrow(value: string): MapLayer {
    const values = Object.values(MapLayer) as string[];
    if (!values.includes(value)) {
      throw new BadRequestException(
        `Invalid mapLayer '${value}'. Allowed values: ${values.join(', ')}`,
      );
    }
    return value as MapLayer;
  }

  @Get('static/:countryCodeIso3/:mapLayer')
  @ApiOperation({
    summary: 'Get static raster metadata by country and mapLayer',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Static raster metadata returned successfully',
    type: StaticRasterResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Static raster not found',
  })
  public async getStaticRaster(
    @Param('countryCodeIso3') countryCodeIso3: string,
    @Param('mapLayer') mapLayerParam: string,
  ): Promise<StaticRasterResponseDto> {
    const mapLayer = this.parseMapLayerOrThrow(mapLayerParam);
    return this.rastersService.getStaticRasterOrThrow(
      countryCodeIso3,
      mapLayer,
    );
  }

  @Get('static/:countryCodeIso3/:mapLayer/image')
  @ApiOperation({ summary: 'Get the static raster coloured image as a PNG' })
  @ApiProduces('image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'PNG image returned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Static raster not found',
  })
  public async getStaticRasterImage(
    @Param('countryCodeIso3') countryCodeIso3: string,
    @Param('mapLayer') mapLayerParam: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const mapLayer = this.parseMapLayerOrThrow(mapLayerParam);
    const buffer = await this.rastersService.getStaticRasterImageOrThrow(
      countryCodeIso3,
      mapLayer,
    );
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(buffer);
  }

  @Get('static/:countryCodeIso3/:mapLayer/data')
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @ApiOperation({
    summary: 'Get the static raster raw data PNG (RGBA-encoded float values)',
  })
  @ApiProduces('image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Raw data PNG returned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Static raster not found',
  })
  public async getStaticRasterDataImage(
    @Param('countryCodeIso3') countryCodeIso3: string,
    @Param('mapLayer') mapLayerParam: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const mapLayer = this.parseMapLayerOrThrow(mapLayerParam);
    const buffer = await this.rastersService.getStaticRasterDataImageOrThrow(
      countryCodeIso3,
      mapLayer,
    );
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(buffer);
  }

  @Put('static')
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @ApiOperation({ summary: 'Upload or update a static raster (upsert)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Static raster upserted successfully',
    type: StaticRasterResponseDto,
  })
  public async upsertStaticRaster(
    @Body() dto: StaticRasterUploadDto,
  ): Promise<StaticRasterResponseDto> {
    return this.rastersService.upsertStaticRaster(dto);
  }

  @Delete('static/:countryCodeIso3/:mapLayer')
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a static raster' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Static raster deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Static raster not found',
  })
  public async deleteStaticRaster(
    @Param('countryCodeIso3') countryCodeIso3: string,
    @Param('mapLayer') mapLayerParam: string,
  ): Promise<void> {
    const mapLayer = this.parseMapLayerOrThrow(mapLayerParam);
    await this.rastersService.deleteStaticRasterOrThrow(
      countryCodeIso3,
      mapLayer,
    );
  }

  @Get('alert/:id')
  @ApiOperation({ summary: 'Get alert raster metadata by its resource ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert raster metadata returned successfully',
    type: AlertRasterResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert raster not found',
  })
  public async getAlertRaster(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AlertRasterResponseDto> {
    return this.rastersService.getAlertRasterOrThrow(id);
  }

  @Get('alert/:id/image')
  @ApiOperation({ summary: 'Get the coloured alert raster image as a PNG' })
  @ApiProduces('image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'PNG image returned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert raster not found',
  })
  public async getAlertRasterImage(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.rastersService.getAlertRasterImageOrThrow(id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(buffer);
  }
}
