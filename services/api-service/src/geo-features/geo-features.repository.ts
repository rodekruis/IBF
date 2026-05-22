import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Feature, FeatureCollection } from 'geojson';

import { env } from '@api-service/src/env';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

const GEO_FEATURE_COLLECTION = 'api-service.geo-feature';

@Injectable()
export class GeoFeaturesRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private async fetchFromFeatureServ(
    params: Record<string, string>,
  ): Promise<FeatureCollection> {
    const url = new URL(
      `/collections/${GEO_FEATURE_COLLECTION}/items.json`,
      env.PG_FEATURESERV_URL,
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `pg_featureserv request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.json() as Promise<FeatureCollection>;
  }

  public async getGeoFeatures(
    query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.fetchFromFeatureServ(query);
  }

  private async getGeoFeatureOrThrow(id: number): Promise<Feature> {
    const collection = await this.fetchFromFeatureServ({
      filter: `id=${id}`,
    });
    if (collection.features.length === 0) {
      throw new NotFoundException(`Geo-feature with id ${id} not found`);
    }
    return collection.features[0];
  }

  public async createGeoFeature(
    geoFeatureCreateDto: GeoFeatureCreateDto,
  ): Promise<Feature> {
    const geojson = JSON.stringify(geoFeatureCreateDto.geometry);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.geoFeature.create({
          data: {
            countryCodeIso3: geoFeatureCreateDto.countryCodeIso3,
            featureType: geoFeatureCreateDto.featureType,
            layer: geoFeatureCreateDto.layer,
            referenceId: geoFeatureCreateDto.referenceId,
            attributes:
              (geoFeatureCreateDto.attributes as Prisma.InputJsonValue) ??
              undefined,
          },
        });
        await tx.$executeRaw`
          UPDATE "api-service"."geo-feature"
          SET geometry = public.ST_Force2D(public.ST_GeomFromGeoJSON(${geojson}))
          WHERE id = ${created.id}`;
        return created;
      });
      return this.getGeoFeatureOrThrow(row.id);
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
        if (error.code === 'P2010') {
          throw new BadRequestException(
            'Invalid geometry: could not parse GeoJSON',
          );
        }
      }
      throw error;
    }
  }

  public async updateGeoFeatureOrThrow(
    id: number,
    geoFeatureUpdateDto: GeoFeatureUpdateDto,
  ): Promise<Feature> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.geoFeature.update({
          where: { id },
          data: {
            ...(geoFeatureUpdateDto.featureType !== undefined && {
              featureType: geoFeatureUpdateDto.featureType,
            }),
            ...(geoFeatureUpdateDto.attributes !== undefined && {
              attributes:
                geoFeatureUpdateDto.attributes as Prisma.InputJsonValue,
            }),
          },
        });
        if (geoFeatureUpdateDto.geometry !== undefined) {
          const geojson = JSON.stringify(geoFeatureUpdateDto.geometry);
          await tx.$executeRaw`
            UPDATE "api-service"."geo-feature"
            SET geometry = public.ST_Force2D(public.ST_GeomFromGeoJSON(${geojson}))
            WHERE id = ${id}`;
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Geo-feature with id ${id} not found`);
        }
        if (error.code === 'P2010') {
          throw new BadRequestException(
            'Invalid geometry: could not parse GeoJSON',
          );
        }
      }
      throw error;
    }
    return this.getGeoFeatureOrThrow(id);
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
