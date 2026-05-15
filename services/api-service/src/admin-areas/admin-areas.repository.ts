import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaResponseDto } from '@api-service/src/admin-areas/dto/admin-area-response.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

// geometry is Unsupported by Prisma ORM; it is fetched/written with targeted
// raw SQL while all scalar fields continue to use the Prisma client.
const adminAreaSelect = {
  id: true,
  created: true,
  updated: true,
  placeCode: true,
  adminLevel: true,
  nameEn: true,
  countryCodeIso3: true,
  parentPlaceCode: true,
} as const;

type AdminAreaScalarRow = Prisma.AdminAreaGetPayload<{
  select: typeof adminAreaSelect;
}>;

interface AdminAreaRow extends AdminAreaScalarRow {
  geometry: Record<string, unknown>;
}

@Injectable()
export class AdminAreasRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: AdminAreaRow): AdminAreaResponseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      placeCode: row.placeCode,
      adminLevel: row.adminLevel,
      nameEn: row.nameEn,
      countryCodeIso3: row.countryCodeIso3,
      parentPlaceCode: row.parentPlaceCode ?? null,
      geometry: row.geometry,
    };
  }

  private async fetchGeometryForRows(
    placeCodes: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const geos = await this.prisma.$queryRaw<
      { placeCode: string; geometry: Record<string, unknown> }[]
    >`
      SELECT "placeCode", public.ST_AsGeoJSON(geometry)::jsonb AS geometry
      FROM "api-service"."admin-area"
      WHERE "placeCode" = ANY(${placeCodes}::text[])`;
    return new Map(geos.map((g) => [g.placeCode, g.geometry]));
  }

  public async getAdminAreas({
    countryCodeIso3,
    adminLevel,
  }: {
    countryCodeIso3: string;
    adminLevel?: number;
  }): Promise<AdminAreaResponseDto[]> {
    const rows = await this.prisma.adminArea.findMany({
      where: {
        countryCodeIso3,
        ...(adminLevel !== undefined && { adminLevel }),
      },
      select: adminAreaSelect,
      orderBy: { placeCode: 'asc' },
    });
    const geometryMap = await this.fetchGeometryForRows(
      rows.map((r) => r.placeCode),
    );
    return rows.map((row) =>
      this.toResponseDto({
        ...row,
        geometry: geometryMap.get(row.placeCode) ?? {},
      }),
    );
  }

  public async getAdminAreaOrThrow(
    placeCode: string,
  ): Promise<AdminAreaResponseDto> {
    const row = await this.prisma.adminArea.findUnique({
      where: { placeCode },
      select: adminAreaSelect,
    });
    if (!row) {
      throw new NotFoundException(`Admin area '${placeCode}' not found`);
    }
    const geometryMap = await this.fetchGeometryForRows([placeCode]);
    return this.toResponseDto({
      ...row,
      geometry: geometryMap.get(placeCode) ?? {},
    });
  }

  public async createAdminArea(
    adminAreaCreateDto: AdminAreaCreateDto,
  ): Promise<AdminAreaResponseDto> {
    const geojson = JSON.stringify(adminAreaCreateDto.geometry);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminArea.create({
          data: {
            placeCode: adminAreaCreateDto.placeCode,
            adminLevel: adminAreaCreateDto.adminLevel,
            nameEn: adminAreaCreateDto.nameEn,
            countryCodeIso3: adminAreaCreateDto.countryCodeIso3,
            parentPlaceCode: adminAreaCreateDto.parentPlaceCode ?? null,
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
      }
      throw error;
    }
    return this.getAdminAreaOrThrow(adminAreaCreateDto.placeCode);
  }

  public async updateAdminAreaOrThrow(
    placeCode: string,
    adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<AdminAreaResponseDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminArea.update({
          where: { placeCode },
          data: {
            adminLevel: adminAreaUpdateDto.adminLevel,
            nameEn: adminAreaUpdateDto.nameEn,
            countryCodeIso3: adminAreaUpdateDto.countryCodeIso3,
            parentPlaceCode: adminAreaUpdateDto.parentPlaceCode,
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
