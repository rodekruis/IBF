import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Feature, FeatureCollection } from 'geojson';

import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';
import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { extractPostgresErrorCode } from '@api-service/src/utils/extract-postgres-error-code.helper';

const ADMIN_AREA_COLLECTION = 'api-service.admin-area';

@Injectable()
export class AdminAreasRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private async fetchFromFeatureServ(
    params: Record<string, string>,
  ): Promise<FeatureCollection> {
    const url = new URL(
      `/collections/${ADMIN_AREA_COLLECTION}/items.json`,
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

  public async getAdminAreas(
    query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.fetchFromFeatureServ(query);
  }

  private async getAdminAreaOrThrow(placeCode: string): Promise<Feature> {
    const collection = await this.fetchFromFeatureServ({
      filter: `placeCode='${placeCode}'`,
    });
    if (collection.features.length === 0) {
      throw new NotFoundException(`Admin area '${placeCode}' not found`);
    }
    return collection.features[0];
  }

  private validateMultiPolygonGeometry(
    geometry: Record<string, unknown>,
  ): void {
    if (geometry.type !== 'MultiPolygon') {
      throw new BadRequestException(
        `Invalid geometry: expected type 'MultiPolygon', got '${String(geometry.type)}'`,
      );
    }
    if (!Array.isArray(geometry.coordinates)) {
      throw new BadRequestException(
        'Invalid geometry: coordinates must be an array',
      );
    }
  }

  public async updateAdminAreaOrThrow(
    placeCode: string,
    adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<Feature> {
    if (adminAreaUpdateDto.geometry !== undefined) {
      this.validateMultiPolygonGeometry(adminAreaUpdateDto.geometry);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminArea.update({
          where: { placeCode },
          data: {
            adminLevel: adminAreaUpdateDto.adminLevel,
            nameEn: adminAreaUpdateDto.nameEn,
            countryCodeIso3: adminAreaUpdateDto.countryCodeIso3,
            placeCodeLevel1: adminAreaUpdateDto.placeCodeLevel1,
            placeCodeLevel2: adminAreaUpdateDto.placeCodeLevel2,
            placeCodeLevel3: adminAreaUpdateDto.placeCodeLevel3,
            placeCodeLevel4: adminAreaUpdateDto.placeCodeLevel4,
            ...(adminAreaUpdateDto.attributes !== undefined && {
              attributes:
                adminAreaUpdateDto.attributes as unknown as Prisma.InputJsonValue,
            }),
          },
        });
        if (adminAreaUpdateDto.geometry !== undefined) {
          const geojson = JSON.stringify(adminAreaUpdateDto.geometry);
          await tx.$executeRaw`
            UPDATE "api-service"."admin-area"
            SET geometry = public.ST_Force2D(public.ST_GeomFromGeoJSON(${geojson}))
            WHERE "placeCode" = ${placeCode}`;
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Admin area '${placeCode}' not found`);
        }
        if (error.code === 'P2003') {
          throw new BadRequestException(
            `Country '${adminAreaUpdateDto.countryCodeIso3}' does not exist`,
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
    return this.getAdminAreaOrThrow(placeCode);
  }

  public async deleteAdminAreaOrThrow(placeCode: string): Promise<void> {
    const row = await this.prisma.adminArea.findUnique({
      where: { placeCode },
    });
    if (!row) {
      throw new NotFoundException(`Admin area '${placeCode}' not found`);
    }
    await this.prisma.adminArea.delete({ where: { placeCode } });
  }

  public async createAdminAreas(dtos: AdminAreaCreateDto[]): Promise<void> {
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
              ${dto.placeCode},
              ${dto.adminLevel},
              ${dto.nameEn},
              ${dto.countryCodeIso3},
              ${dto.placeCodeLevel1 ?? null},
              ${dto.placeCodeLevel2 ?? null},
              ${dto.placeCodeLevel3 ?? null},
              ${dto.placeCodeLevel4 ?? null},
              ${attrs}::jsonb,
              NOW(),
              NOW(),
              public.ST_Force2D(public.ST_GeomFromGeoJSON(${geojson}))
            )`;
          });
          await tx.$executeRaw`
            INSERT INTO "api-service"."admin-area"
              ("placeCode", "adminLevel", "nameEn", "countryCodeIso3", "placeCodeLevel1", "placeCodeLevel2", "placeCodeLevel3", "placeCodeLevel4", attributes, created, updated, geometry)
            VALUES ${Prisma.join(values)}`;
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2010') {
          const pgCode = extractPostgresErrorCode(error);
          if (pgCode === '23505') {
            throw new ConflictException('One or more placeCodes already exist');
          }
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
