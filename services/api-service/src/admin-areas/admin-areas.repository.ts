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

  public async createAdminArea(
    adminAreaCreateDto: AdminAreaCreateDto,
  ): Promise<Feature> {
    this.validateMultiPolygonGeometry(adminAreaCreateDto.geometry);
    const geojson = JSON.stringify(adminAreaCreateDto.geometry);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminArea.create({
          data: {
            placeCode: adminAreaCreateDto.placeCode,
            adminLevel: adminAreaCreateDto.adminLevel,
            nameEn: adminAreaCreateDto.nameEn,
            countryCodeIso3: adminAreaCreateDto.countryCodeIso3,
            placeCodeLevel1: adminAreaCreateDto.placeCodeLevel1,
            placeCodeLevel2: adminAreaCreateDto.placeCodeLevel2,
            placeCodeLevel3: adminAreaCreateDto.placeCodeLevel3,
            placeCodeLevel4: adminAreaCreateDto.placeCodeLevel4,
            attributes:
              (adminAreaCreateDto.attributes as Prisma.InputJsonValue) ??
              undefined,
          },
        });
        await tx.$executeRaw`
          UPDATE "api-service"."admin-area"
          SET geometry = public.ST_Force2D(public.ST_GeomFromGeoJSON(${geojson}))
          WHERE "placeCode" = ${adminAreaCreateDto.placeCode}`;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Admin area '${adminAreaCreateDto.placeCode}' already exists`,
          );
        }
        if (error.code === 'P2003') {
          throw new BadRequestException(
            `Country '${adminAreaCreateDto.countryCodeIso3}' does not exist`,
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
    return this.getAdminAreaOrThrow(adminAreaCreateDto.placeCode);
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
}
