import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { AlertClass } from '@api-service/src/events/enum/classification-level.enum';
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
      hazardType: row.hazardType as HazardType,
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
      triggerAlertClass: row.triggerAlertClass as AlertClass | null,
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

  public async createAlertConfig(
    alertConfigCreateDto: AlertConfigCreateDto,
  ): Promise<AlertConfigResponseDto> {
    try {
      const row = await this.prisma.alertConfig.create({
        data: {
          countryCodeIso3: alertConfigCreateDto.countryCodeIso3,
          hazardType: alertConfigCreateDto.hazardType,
          spatialExtentName: alertConfigCreateDto.spatialExtentName,
          spatialExtentPlaceCodes: alertConfigCreateDto.spatialExtentPlaceCodes,
          temporalExtents: alertConfigCreateDto.temporalExtents,
          severityClassLevels:
            alertConfigCreateDto.severityClassLevels as unknown as Prisma.InputJsonValue,
          probabilityClassLevels:
            alertConfigCreateDto.probabilityClassLevels as unknown as Prisma.InputJsonValue,
          triggerAlertClass: alertConfigCreateDto.triggerAlertClass ?? null,
          triggerLeadTimeDuration:
            alertConfigCreateDto.triggerLeadTimeDuration ?? null,
        },
      });

      return this.toResponseDto(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          `Country '${alertConfigCreateDto.countryCodeIso3}' does not exist`,
        );
      }
      throw error;
    }
  }

  public async deleteAlertConfigOrThrow(id: number): Promise<void> {
    const row = await this.prisma.alertConfig.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Alert config with id ${id} not found`);
    }
    await this.prisma.alertConfig.delete({ where: { id } });
  }
}
