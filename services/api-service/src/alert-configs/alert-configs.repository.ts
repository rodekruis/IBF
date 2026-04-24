import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

const alertConfigSelect = {
  id: true,
  countryCodeIso3: true,
  hazardType: true,
  spatialExtentName: true,
  spatialExtentPlaceCodes: true,
  temporalExtents: true,
} satisfies Prisma.AlertConfigSelect;

type AlertConfigRow = Prisma.AlertConfigGetPayload<{
  select: typeof alertConfigSelect;
}>;

@Injectable()
export class AlertConfigsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: AlertConfigRow): AlertConfigResponseDto {
    return {
      id: row.id,
      countryCodeIso3: row.countryCodeIso3,
      hazardType: row.hazardType,
      spatialExtentName: row.spatialExtentName,
      spatialExtentPlaceCodes: row.spatialExtentPlaceCodes,
      temporalExtents: row.temporalExtents as unknown as Record<
        string,
        string[]
      >[],
    };
  }

  public async getAlertConfigs({
    countryCodeIso3,
    hazardType,
  }: {
    countryCodeIso3: string;
    hazardType: string;
  }): Promise<AlertConfigResponseDto[]> {
    const rows = await this.prisma.alertConfig.findMany({
      where: {
        countryCodeIso3,
        hazardType,
      },
      select: alertConfigSelect,
    });
    return rows.map((row) => this.toResponseDto(row));
  }
}
