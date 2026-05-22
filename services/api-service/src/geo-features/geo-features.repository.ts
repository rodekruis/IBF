import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Layer } from '@api-service/src/alerts/enum/shared-enums';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

type GeoFeatureRow = Prisma.GeoFeatureGetPayload<null>;

@Injectable()
export class GeoFeaturesRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: GeoFeatureRow): GeoFeatureResponseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      countryCodeIso3: row.countryCodeIso3,
      featureType: row.featureType as GeoFeatureType,
      layer: row.layer as Layer,
      referenceId: row.referenceId,
      geometry: row.geometry as Record<string, unknown>,
      attributes: row.attributes as Record<string, unknown>,
    };
  }

  public async getGeoFeatures({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3?: string;
    layer?: string;
  }): Promise<GeoFeatureResponseDto[]> {
    const rows = await this.prisma.geoFeature.findMany({
      where: {
        ...(countryCodeIso3 !== undefined && { countryCodeIso3 }),
        ...(layer !== undefined && { layer }),
      },
      orderBy: { referenceId: 'asc' },
    });
    return rows.map((row) => this.toResponseDto(row));
  }

  public async createGeoFeature(
    geoFeatureCreateDto: GeoFeatureCreateDto,
  ): Promise<GeoFeatureResponseDto> {
    try {
      const row = await this.prisma.geoFeature.create({
        data: {
          countryCodeIso3: geoFeatureCreateDto.countryCodeIso3,
          featureType: geoFeatureCreateDto.featureType,
          layer: geoFeatureCreateDto.layer,
          referenceId: geoFeatureCreateDto.referenceId,
          geometry: geoFeatureCreateDto.geometry as Prisma.InputJsonValue,
          attributes:
            (geoFeatureCreateDto.attributes as Prisma.InputJsonValue) ??
            undefined,
        },
      });
      return this.toResponseDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Geo-feature with country '${geoFeatureCreateDto.countryCodeIso3}', layer '${geoFeatureCreateDto.layer}' and referenceId '${geoFeatureCreateDto.referenceId}' already exists`,
          );
        }
        if (error.code === 'P2003') {
          throw new BadRequestException(
            `Country '${geoFeatureCreateDto.countryCodeIso3}' does not exist`,
          );
        }
      }
      throw error;
    }
  }

  public async updateGeoFeatureOrThrow(
    id: number,
    geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<GeoFeatureResponseDto> {
    try {
      const row = await this.prisma.geoFeature.update({
        where: { id },
        data: {
          ...(geoFeatureUpdateDto.featureType !== undefined && {
            featureType: geoFeatureUpdateDto.featureType,
          }),
          ...(geoFeatureUpdateDto.geometry !== undefined && {
            geometry: geoFeatureUpdateDto.geometry as Prisma.InputJsonValue,
          }),
          ...(geoFeatureUpdateDto.attributes !== undefined && {
            attributes: geoFeatureUpdateDto.attributes as Prisma.InputJsonValue,
          }),
        },
      });
      return this.toResponseDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Geo-feature with id ${id} not found`);
        }
      }
      throw error;
    }
  }

  public async deleteGeoFeatureOrThrow(id: number): Promise<void> {
    try {
      await this.prisma.geoFeature.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Geo-feature with id ${id} not found`);
        }
      }
      throw error;
    }
  }
}
