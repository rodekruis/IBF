import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Feature, FeatureCollection } from 'geojson';

import { env } from '@api-service/src/env';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureUpdateDto } from '@api-service/src/geo-features/dto/geo-feature-update.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { extractPostgresErrorCode } from '@api-service/src/utils/extract-postgres-error-code.helper';

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

  public async createGeoFeatures(dtos: GeoFeatureCreateDto[]): Promise<void> {
    if (dtos.length === 0) {
      return;
    }

    const BATCH_SIZE = 100;
    try {
      // Uses raw SQL because Prisma's client API cannot call PostGIS functions (ST_GeomFromGeoJSON) inline
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < dtos.length; i += BATCH_SIZE) {
          const batch = dtos.slice(i, i + BATCH_SIZE);
          const values = batch.map((dto) => {
            const geojson = JSON.stringify(dto.geometry);
            const attrs = JSON.stringify(dto.attributes ?? {});
            return Prisma.sql`(
              ${dto.countryCodeIso3},
              ${dto.featureType},
              (SELECT "id" FROM "api-service"."layer" WHERE "name" = ${dto.layer}::"api-service"."LayerName"),
              ${dto.referenceId},
              public.ST_SetSRID(public.ST_GeomFromGeoJSON(${geojson}), 4326),
              ${attrs}::jsonb,
              NOW()
            )`;
          });
          await tx.$executeRaw`
            INSERT INTO "api-service"."geo-feature"
              ("countryCodeIso3", "featureType", "layerId", "referenceId", "geometry", "attributes", "updated")
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("countryCodeIso3", "layerId", "referenceId") DO NOTHING`;
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2010') {
          const pgCode = extractPostgresErrorCode(error);
          if (pgCode === '23503') {
            throw new BadRequestException(
              'One or more referenced countries do not exist',
            );
          }
          throw new BadRequestException(
            'Invalid geometry: could not parse GeoJSON',
          );
        }
      }
      throw error;
    }
  }
}
