import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RasterMetadataDto } from '@api-service/src/alerts/dto/raster-metadata.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { AlertRasterResponseDto } from '@api-service/src/rasters/dto/alert-raster-response.dto';
import { StaticRasterResponseDto } from '@api-service/src/rasters/dto/static-raster-response.dto';
import { StaticRasterUploadDto } from '@api-service/src/rasters/dto/static-raster-upload.dto';
import { LayerName } from '@api-service/src/shared-enums';

@Injectable()
export class RastersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private async getLayerIdOrThrow(layerName: LayerName): Promise<number> {
    const layer = await this.prisma.layer.findUnique({
      where: { name: layerName },
      select: { id: true },
    });
    if (!layer) {
      throw new NotFoundException(`Layer '${layerName}' not found`);
    }
    return layer.id;
  }

  public async getAlertRasterOrThrow(
    id: number,
  ): Promise<AlertRasterResponseDto> {
    const raster = await this.prisma.alertExposureRasterData.findUnique({
      where: { id },
      select: {
        layer: { select: { name: true } },
        metadata: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(`Raster with id ${id} not found`);
    }

    return {
      layer: raster.layer.name,
      metadata: raster.metadata as unknown as RasterMetadataDto,
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
    layerName: LayerName,
  ): Promise<StaticRasterResponseDto> {
    const layerId = await this.getLayerIdOrThrow(layerName);
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layerId: { countryCodeIso3, layerId },
      },
      select: {
        id: true,
        layer: { select: { name: true } },
        metadata: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layerName} not found`,
      );
    }

    return {
      id: raster.id,
      layer: raster.layer.name,
      metadata: raster.metadata as unknown as RasterMetadataDto,
    };
  }

  public async getStaticRasterImageOrThrow(
    countryCodeIso3: string,
    layerName: LayerName,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      layerName,
      'valueColoured',
    );
  }

  public async getStaticRasterDataImageOrThrow(
    countryCodeIso3: string,
    layerName: LayerName,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      layerName,
      'valueData',
    );
  }

  private async getStaticRasterImageBufferOrThrow(
    countryCodeIso3: string,
    layerName: LayerName,
    field: 'valueColoured' | 'valueData',
  ): Promise<Buffer> {
    const layerId = await this.getLayerIdOrThrow(layerName);
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layerId: { countryCodeIso3, layerId },
      },
      select: {
        [field]: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layerName} not found`,
      );
    }

    return Buffer.from(raster[field] as string, 'base64');
  }

  public async upsertStaticRaster(
    dto: StaticRasterUploadDto,
  ): Promise<StaticRasterResponseDto> {
    const layerId = await this.getLayerIdOrThrow(dto.layer);
    const raster = await this.prisma.staticRasterData.upsert({
      where: {
        countryCodeIso3_layerId: {
          countryCodeIso3: dto.countryCodeIso3,
          layerId,
        },
      },
      update: {
        valueData: dto.valueData,
        valueColoured: dto.valueColoured,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
      create: {
        countryCodeIso3: dto.countryCodeIso3,
        layerId,
        valueData: dto.valueData,
        valueColoured: dto.valueColoured,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        layer: { select: { name: true } },
        metadata: true,
      },
    });

    return {
      id: raster.id,
      layer: raster.layer.name,
      metadata: raster.metadata as unknown as RasterMetadataDto,
    };
  }

  public async deleteStaticRasterOrThrow(
    countryCodeIso3: string,
    layerName: LayerName,
  ): Promise<void> {
    const layerId = await this.getLayerIdOrThrow(layerName);
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layerId: { countryCodeIso3, layerId },
      },
      select: { id: true },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layerName} not found`,
      );
    }

    await this.prisma.staticRasterData.delete({
      where: { id: raster.id },
    });
  }
}
