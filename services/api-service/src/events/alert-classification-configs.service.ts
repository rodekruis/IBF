import { Injectable } from '@nestjs/common';

import { AlertClassificationConfig } from '@api-service/src/events/interfaces/alert-classification-config';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

@Injectable()
export class AlertClassificationConfigsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async getByHazardType(
    hazardType: string,
  ): Promise<AlertClassificationConfig | undefined> {
    const row = await this.prisma.alertConfig.findFirst({
      where: { hazardType },
      select: {
        severityClassLevels: true,
        probabilityClassLevels: true,
        alertClassMatrix: true,
        alertClassOrder: true,
        triggerAlertClass: true,
        triggerLeadTimeDuration: true,
      },
    });
    if (!row) {
      return undefined;
    }
    return row as unknown as AlertClassificationConfig;
  }
}
