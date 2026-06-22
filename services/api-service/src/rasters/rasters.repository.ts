import { Injectable, NotFoundException } from '@nestjs/common';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { RasterResponseDto } from '@api-service/src/rasters/dto/raster-response.dto';
import { LayerName } from '@api-service/src/shared-enums';

@Injectable()
export class RastersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  // TODO AB#42339: currently only serves alert-related rasters from AlertExposureRasterData;
  // static rasters (e.g. population) will come from a separate static raster table
  // whereby resourceId pointing to alert-exposure-raster-data primary key id, will no longer be sufficient to identify the raster
  public async getRasterOrThrow(id: number): Promise<RasterResponseDto> {
    const raster = await this.prisma.alertExposureRasterData.findUnique({
      where: { id },
      select: {
        layer: true,
        extent: true,
      },
    });

    if (!raster) {
      throw new NotFoundException(`Raster with id ${id} not found`);
    }

    return {
      layer: raster.layer as LayerName,
      extent: raster.extent as unknown as RasterExtentDto,
    };
  }

  public async getRasterImageOrThrow(id: number): Promise<Buffer> {
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
}
