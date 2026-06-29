import { Injectable, NotFoundException } from '@nestjs/common';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { AlertRasterResponseDto } from '@api-service/src/rasters/dto/alert-raster-response.dto';
import { StaticRasterResponseDto } from '@api-service/src/rasters/dto/static-raster-response.dto';
import { StaticRasterUploadDto } from '@api-service/src/rasters/dto/static-raster-upload.dto';
import { MapLayer } from '@api-service/src/shared-enums';

@Injectable()
export class RastersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getAlertRasterOrThrow(
    id: number,
  ): Promise<AlertRasterResponseDto> {
    const raster = await this.prisma.alertExposureRasterData.findUnique({
      where: { id },
      select: {
        mapLayer: true,
        extent: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(`Raster with id ${id} not found`);
    }

    return {
      mapLayer: raster.mapLayer as MapLayer,
      extent: raster.extent as unknown as RasterExtentDto,
    };
  }

  public async getAlertRasterImageOrThrow(id: number): Promise<Buffer> {
    const raster = await this.prisma.alertExposureRasterData.findUnique({
      where: { id },
      select: {
        valueColoured: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(`Raster with id ${id} not found`);
    }

    return Buffer.from(raster.valueColoured, 'base64');
  }

  public async getStaticRasterOrThrow(
    countryCodeIso3: string,
    mapLayer: MapLayer,
  ): Promise<StaticRasterResponseDto> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_mapLayer: { countryCodeIso3, mapLayer },
      },
      select: {
        id: true,
        mapLayer: true,
        extent: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${mapLayer} not found`,
      );
    }

    return {
      id: raster.id,
      mapLayer: raster.mapLayer as MapLayer,
      extent: raster.extent as unknown as RasterExtentDto,
    };
  }

  public async getStaticRasterImageOrThrow(
    countryCodeIso3: string,
    mapLayer: MapLayer,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      mapLayer,
      'valueColoured',
    );
  }

  public async getStaticRasterDataImageOrThrow(
    countryCodeIso3: string,
    mapLayer: MapLayer,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      mapLayer,
      'valueBlackWhite',
    );
  }

  private async getStaticRasterImageBufferOrThrow(
    countryCodeIso3: string,
    mapLayer: MapLayer,
    field: 'valueColoured' | 'valueBlackWhite',
  ): Promise<Buffer> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_mapLayer: { countryCodeIso3, mapLayer },
      },
      select: {
        [field]: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${mapLayer} not found`,
      );
    }

    return Buffer.from(raster[field] as string, 'base64');
  }

  public async upsertStaticRaster(
    dto: StaticRasterUploadDto,
  ): Promise<StaticRasterResponseDto> {
    const raster = await this.prisma.staticRasterData.upsert({
      where: {
        countryCodeIso3_mapLayer: {
          countryCodeIso3: dto.countryCodeIso3,
          mapLayer: dto.mapLayer,
        },
      },
      update: {
        valueBlackWhite: dto.valueBlackWhite,
        valueColoured: dto.valueColoured,
        extent: dto.extent as unknown as Record<string, number>,
      },
      create: {
        countryCodeIso3: dto.countryCodeIso3,
        mapLayer: dto.mapLayer,
        valueBlackWhite: dto.valueBlackWhite,
        valueColoured: dto.valueColoured,
        extent: dto.extent as unknown as Record<string, number>,
      },
      select: {
        id: true,
        mapLayer: true,
        extent: true,
      },
    });

    return {
      id: raster.id,
      mapLayer: raster.mapLayer as MapLayer,
      extent: raster.extent as unknown as RasterExtentDto,
    };
  }

  public async deleteStaticRasterOrThrow(
    countryCodeIso3: string,
    mapLayer: MapLayer,
  ): Promise<void> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_mapLayer: { countryCodeIso3, mapLayer },
      },
      select: { id: true },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${mapLayer} not found`,
      );
    }

    await this.prisma.staticRasterData.delete({
      where: { id: raster.id },
    });
  }
}
