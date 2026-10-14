import { Injectable } from '@nestjs/common';

import { AlertRasterResponseDto } from '@api-service/src/rasters/dto/alert-raster-response.dto';
import { StaticRasterResponseDto } from '@api-service/src/rasters/dto/static-raster-response.dto';
import { StaticRasterSourceMetadataDto } from '@api-service/src/rasters/dto/static-raster-source-metadata.dto';
import { UploadableStaticRasterLayer } from '@api-service/src/rasters/dto/static-raster-upload.dto';
import { RastersRepository } from '@api-service/src/rasters/rasters.repository';
import { LayerName } from '@api-service/src/shared-enums';
import { processPopulationRaster } from '@api-service/src/utils/raster-colorization.helper';

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

  public async getStaticRasterOrThrow({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3: string;
    layer: LayerName;
  }): Promise<StaticRasterResponseDto> {
    return this.rastersRepository.getStaticRasterOrThrow({
      countryCodeIso3,
      layerName: layer,
    });
  }

  public async getStaticRasterImageOrThrow({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3: string;
    layer: LayerName;
  }): Promise<Buffer> {
    return this.rastersRepository.getStaticRasterImageOrThrow({
      countryCodeIso3,
      layerName: layer,
    });
  }

  public async getStaticRasterDataImageOrThrow({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3: string;
    layer: LayerName;
  }): Promise<Buffer> {
    return this.rastersRepository.getStaticRasterDataImageOrThrow({
      countryCodeIso3,
      layerName: layer,
    });
  }

  public async upsertStaticRaster({
    countryCodeIso3,
    layer,
    dataPngBuffer,
    metadata,
  }: {
    countryCodeIso3: string;
    layer: UploadableStaticRasterLayer;
    dataPngBuffer: Buffer;
    metadata: StaticRasterSourceMetadataDto;
  }): Promise<StaticRasterResponseDto> {
    const { colouredBase64, metadata: rasterMetadata } =
      processPopulationRaster({ dataPngBuffer, metadata });

    return this.rastersRepository.upsertStaticRaster({
      countryCodeIso3,
      layerName: layer,
      valueData: dataPngBuffer.toString('base64'),
      valueColoured: colouredBase64,
      metadata: rasterMetadata,
    });
  }

  public async deleteStaticRasterOrThrow({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3: string;
    layer: LayerName;
  }): Promise<void> {
    await this.rastersRepository.deleteStaticRasterOrThrow({
      countryCodeIso3,
      layerName: layer,
    });
  }
}
