import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { LayerCreateDto } from '@api-service/src/layers/dto/layer-create.dto';
import { LayerReadDto } from '@api-service/src/layers/dto/layer-read.dto';
import { LayerUpdateDto } from '@api-service/src/layers/dto/layer-update.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { HazardType, LayerName } from '@api-service/src/shared-enums';

const layerSelect = {
  id: true,
  name: true,
  label: true,
  type: true,
  hazardType: true,
  description: true,
} as const;

@Injectable()
export class LayersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toReadDto(row: {
    id: number;
    name: LayerName;
    label: string;
    type: string;
    hazardType: HazardType | null;
    description: string | null;
  }): LayerReadDto {
    return {
      id: row.id,
      name: row.name,
      label: row.label,
      type: row.type as LayerReadDto['type'],
      hazardType: row.hazardType,
      description: row.description,
    };
  }

  public async getLayers(): Promise<LayerReadDto[]> {
    const rows = await this.prisma.layer.findMany({
      select: layerSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toReadDto(row));
  }

  public async createLayer(dto: LayerCreateDto): Promise<LayerReadDto> {
    const existing = await this.prisma.layer.findUnique({
      where: { name: dto.name },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Layer '${dto.name}' already exists`);
    }

    const row = await this.prisma.layer.create({
      data: {
        name: dto.name,
        label: dto.label,
        type: dto.type,
        hazardType: dto.hazardType,
        description: dto.description,
      },
      select: layerSelect,
    });
    return this.toReadDto(row);
  }

  public async updateLayerOrThrow(
    layerName: LayerName,
    dto: LayerUpdateDto,
  ): Promise<LayerReadDto> {
    const existing = await this.prisma.layer.findUnique({
      where: { name: layerName },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Layer '${layerName}' not found`);
    }

    const row = await this.prisma.layer.update({
      where: { name: layerName },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.hazardType !== undefined && { hazardType: dto.hazardType }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      select: layerSelect,
    });
    return this.toReadDto(row);
  }

  public async deleteLayerOrThrow(layerName: LayerName): Promise<void> {
    const existing = await this.prisma.layer.findUnique({
      where: { name: layerName },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Layer '${layerName}' not found`);
    }

    await this.prisma.layer.delete({
      where: { id: existing.id },
    });
  }
}
