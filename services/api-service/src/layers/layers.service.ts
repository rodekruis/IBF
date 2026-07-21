import { Injectable } from '@nestjs/common';

import { LayerCreateDto } from '@api-service/src/layers/dto/layer-create.dto';
import { LayerReadDto } from '@api-service/src/layers/dto/layer-read.dto';
import { LayerUpdateDto } from '@api-service/src/layers/dto/layer-update.dto';
import { LayersRepository } from '@api-service/src/layers/layers.repository';
import { HazardType, LayerName } from '@api-service/src/shared-enums';

@Injectable()
export class LayersService {
  public constructor(private readonly layersRepository: LayersRepository) {}

  public async getLayers(): Promise<LayerReadDto[]> {
    return this.layersRepository.getLayers();
  }

  public async getLayersForHazardTypes(
    hazardTypes: HazardType[],
  ): Promise<LayerReadDto[]> {
    return this.layersRepository.getLayersForHazardTypes(hazardTypes);
  }

  public async createLayer(dto: LayerCreateDto): Promise<LayerReadDto> {
    return this.layersRepository.createLayer(dto);
  }

  public async updateLayerOrThrow(
    layerName: LayerName,
    dto: LayerUpdateDto,
  ): Promise<LayerReadDto> {
    return this.layersRepository.updateLayerOrThrow(layerName, dto);
  }

  public async deleteLayerOrThrow(layerName: LayerName): Promise<void> {
    return this.layersRepository.deleteLayerOrThrow(layerName);
  }
}
