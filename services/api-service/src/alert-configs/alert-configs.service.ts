import { Injectable } from '@nestjs/common';

import { AlertConfigsRepository } from '@api-service/src/alert-configs/alert-configs.repository';
import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { HazardType } from '@api-service/src/shared-enums';

@Injectable()
export class AlertConfigsService {
  public constructor(
    private readonly alertConfigsRepository: AlertConfigsRepository,
  ) {}

  public async getAlertConfigs({
    countryCodeIso3,
    hazardType,
  }: {
    countryCodeIso3?: string;
    hazardType?: HazardType;
  }): Promise<AlertConfigResponseDto[]> {
    return this.alertConfigsRepository.getAlertConfigs({
      countryCodeIso3,
      hazardType,
    });
  }

  public async createAlertConfigs(
    dtos: AlertConfigCreateDto[],
  ): Promise<AlertConfigResponseDto[]> {
    return this.alertConfigsRepository.createAlertConfigs(dtos);
  }

  public async deleteAlertConfigOrThrow(id: number): Promise<void> {
    await this.alertConfigsRepository.deleteAlertConfigOrThrow(id);
  }
}
