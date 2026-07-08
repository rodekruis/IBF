import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { HazardType } from '@api-service/src/shared-enums';

type AlertConfigRow = Prisma.AlertConfigGetPayload<null>;

@Injectable()
export class AlertConfigsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: AlertConfigRow): AlertConfigResponseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      countryCodeIso3: row.countryCodeIso3,
      hazardType: row.hazardType,
      spatialExtentName: row.spatialExtentName,
      spatialExtentPlaceCodes: row.spatialExtentPlaceCodes,
      temporalExtents: row.temporalExtents as unknown as Record<
        string,
        string[] | number[]
      >[],
      severityClassLevels:
        row.severityClassLevels as unknown as ClassLevelDto[],
      probabilityClassLevels:
        row.probabilityClassLevels as unknown as ClassLevelDto[],
      triggerAlertClass: row.triggerAlertClass,
      triggerLeadTimeDuration: row.triggerLeadTimeDuration,
    };
  }

  public async getAlertConfigs({
    countryCodeIso3,
    hazardType,
  }: {
    countryCodeIso3?: string;
    hazardType?: HazardType;
  }): Promise<AlertConfigResponseDto[]> {
    const rows = await this.prisma.alertConfig.findMany({
      where: {
        ...(countryCodeIso3 !== undefined && { countryCodeIso3 }),
        ...(hazardType !== undefined && { hazardType }),
      },
      orderBy: { updated: 'desc' },
    });
    return rows.map((row: AlertConfigRow) => this.toResponseDto(row));
  }

  public async deleteAlertConfigOrThrow(id: number): Promise<void> {
    const row = await this.prisma.alertConfig.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Alert config with id ${id} not found`);
    }
    await this.prisma.alertConfig.delete({ where: { id } });
  }

  public async createAlertConfigs(
    dtos: AlertConfigCreateDto[],
  ): Promise<AlertConfigResponseDto[]> {
    if (dtos.length === 0) {
      return [];
    }

    try {
      const rows = await this.prisma.$transaction(
        dtos.map((dto) =>
          this.prisma.alertConfig.create({
            data: {
              countryCodeIso3: dto.countryCodeIso3,
              hazardType: dto.hazardType,
              spatialExtentName: dto.spatialExtentName,
              spatialExtentPlaceCodes: dto.spatialExtentPlaceCodes,
              temporalExtents:
                dto.temporalExtents as unknown as Prisma.InputJsonValue,
              severityClassLevels:
                dto.severityClassLevels as unknown as Prisma.InputJsonValue,
              probabilityClassLevels:
                dto.probabilityClassLevels as unknown as Prisma.InputJsonValue,
              triggerAlertClass: dto.triggerAlertClass ?? null,
              triggerLeadTimeDuration: dto.triggerLeadTimeDuration ?? null,
            },
          }),
        ),
      );
      return rows.map((row) => this.toResponseDto(row));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException(
            'One or more referenced countries do not exist',
          );
        }
      }
      throw error;
    }
  }
}
