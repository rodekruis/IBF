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

const adminAreaSelect = {
  id: true,
  created: true,
  updated: true,
  placeCode: true,
  adminLevel: true,
  nameEn: true,
  countryCodeIso3: true,
  parentPlaceCode: true,
  geometry: true,
} as const;

type AdminAreaRow = Prisma.AdminAreaGetPayload<{
  select: typeof adminAreaSelect;
}>;

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
      geometry: row.geometry as Record<string, unknown>,
    };
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
    return rows.map((row) => this.toResponseDto(row));
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
    return this.toResponseDto(row);
  }

  public async createAdminArea(
    adminAreaCreateDto: AdminAreaCreateDto,
  ): Promise<AdminAreaResponseDto> {
    try {
      const row = await this.prisma.adminArea.create({
        data: {
          placeCode: adminAreaCreateDto.placeCode,
          adminLevel: adminAreaCreateDto.adminLevel,
          nameEn: adminAreaCreateDto.nameEn,
          countryCodeIso3: adminAreaCreateDto.countryCodeIso3,
          parentPlaceCode: adminAreaCreateDto.parentPlaceCode ?? null,
          geometry: adminAreaCreateDto.geometry as Prisma.InputJsonValue,
        },
        select: adminAreaSelect,
      });
      return this.toResponseDto(row);
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
  }

  public async updateAdminAreaOrThrow(
    placeCode: string,
    adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<AdminAreaResponseDto> {
    try {
      const row = await this.prisma.adminArea.update({
        where: { placeCode },
        data: {
          adminLevel: adminAreaUpdateDto.adminLevel,
          nameEn: adminAreaUpdateDto.nameEn,
          countryCodeIso3: adminAreaUpdateDto.countryCodeIso3,
          parentPlaceCode: adminAreaUpdateDto.parentPlaceCode,
          ...(adminAreaUpdateDto.geometry !== undefined && {
            geometry: adminAreaUpdateDto.geometry as Prisma.InputJsonValue,
          }),
        },
        select: adminAreaSelect,
      });
      return this.toResponseDto(row);
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
