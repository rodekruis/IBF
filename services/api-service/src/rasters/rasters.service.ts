import { Injectable } from '@nestjs/common';

import { AlertRasterResponseDto } from '@api-service/src/rasters/dto/alert-raster-response.dto';
import { StaticRasterResponseDto } from '@api-service/src/rasters/dto/static-raster-response.dto';
import { StaticRasterUploadDto } from '@api-service/src/rasters/dto/static-raster-upload.dto';
import { RastersRepository } from '@api-service/src/rasters/rasters.repository';
import { LayerName } from '@api-service/src/shared-enums';

@Injectable()
export class RastersService {
  public constructor(private readonly rastersRepository: RastersRepository) {}

  public async getAlertRasterOrThrow(
    id: number,
  ): Promise<AlertRasterResponseDto> {
    return this.rastersRepository.getAlertRasterOrThrow(id);
  }

  public async getAlertRasterImageOrThrow(id: number): Promise<Buffer> {
    return this.rastersRepository.getAlertRasterImageOrThrow(id);
  }

  public async getStaticRasterOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<StaticRasterResponseDto> {
    return this.rastersRepository.getStaticRasterOrThrow(
      countryCodeIso3,
      layer,
    );
  }

  public async getStaticRasterImageOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<Buffer> {
    return this.rastersRepository.getStaticRasterImageOrThrow(
      countryCodeIso3,
      layer,
    );
  }

  public async getStaticRasterDataImageOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<Buffer> {
    return this.rastersRepository.getStaticRasterDataImageOrThrow(
      countryCodeIso3,
      layer,
    );
  }

  public async upsertStaticRaster(
    dto: StaticRasterUploadDto,
  ): Promise<StaticRasterResponseDto> {
    return this.rastersRepository.upsertStaticRaster(dto);
  }

  public async deleteStaticRasterOrThrow(
    countryCodeIso3: string,
    layer: LayerName,
  ): Promise<void> {
    await this.rastersRepository.deleteStaticRasterOrThrow(
      countryCodeIso3,
      layer,
    );
  }
}
