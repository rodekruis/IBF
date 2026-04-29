import { Injectable } from '@nestjs/common';

import { AlertConfigsRepository } from '@api-service/src/alert-configs/alert-configs.repository';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';

@Injectable()
export class AlertConfigsService {
  public constructor(
    private readonly alertConfigsRepository: AlertConfigsRepository,
  ) {}

  public async getAlertConfigs({
    countryCodeIso3,
    hazardType,
  }: {
    countryCodeIso3: string;
    hazardType: string;
  }): Promise<AlertConfigResponseDto[]> {
    return this.alertConfigsRepository.getAlertConfigs({
      countryCodeIso3,
      hazardType,
    });
  }
}
