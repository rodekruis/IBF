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

  public async getAlertRasterOrThrow(
    id: number,
  ): Promise<AlertRasterResponseDto> {
    const raster = await this.prisma.alertExposureRasterData.findUnique({
      where: { id },
      select: {
        layer: true,
        metadata: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(`Raster with id ${id} not found`);
    }

    return {
      layer: raster.layer,
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
    layer: LayerName,
  ): Promise<StaticRasterResponseDto> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layer: { countryCodeIso3, layer },
      },
      select: {
        id: true,
        layer: true,
        metadata: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layer} not found`,
      );
    }

    return {
      id: raster.id,
      layer: raster.layer,
      metadata: raster.metadata as unknown as RasterMetadataDto,
    };
  }

  public async getStaticRasterImageOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      layer,
      'valueColoured',
    );
  }

  public async getStaticRasterDataImageOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<Buffer> {
    return this.getStaticRasterImageBufferOrThrow(
      countryCodeIso3,
      layer,
      'valueData',
    );
  }

  private async getStaticRasterImageBufferOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
    field: 'valueColoured' | 'valueData',
  ): Promise<Buffer> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layer: { countryCodeIso3, layer },
      },
      select: {
        [field]: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layer} not found`,
      );
    }

    return Buffer.from(raster[field] as string, 'base64');
  }

  public async upsertStaticRaster(
    dto: StaticRasterUploadDto,
  ): Promise<StaticRasterResponseDto> {
    const raster = await this.prisma.staticRasterData.upsert({
      where: {
        countryCodeIso3_layer: {
          countryCodeIso3: dto.countryCodeIso3,
          layer: dto.layer,
        },
      },
      update: {
        valueData: dto.valueData,
        valueColoured: dto.valueColoured,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
      create: {
        countryCodeIso3: dto.countryCodeIso3,
        layer: dto.layer,
        valueData: dto.valueData,
        valueColoured: dto.valueColoured,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        layer: true,
        metadata: true,
      },
    });

    return {
      id: raster.id,
      layer: raster.layer,
      metadata: raster.metadata as unknown as RasterMetadataDto,
    };
  }

  public async deleteStaticRasterOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<void> {
    const raster = await this.prisma.staticRasterData.findUnique({
      where: {
        countryCodeIso3_layer: { countryCodeIso3, layer },
      },
      select: { id: true },
    });

    if (!raster) {
      throw new NotFoundException(
        `Static raster for ${countryCodeIso3}/${layer} not found`,
      );
    }

    await this.prisma.staticRasterData.delete({
      where: { id: raster.id },
    });
  }
}
