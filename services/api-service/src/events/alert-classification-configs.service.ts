import { Injectable } from '@nestjs/common';

import { MOCK_ALERT_CLASSIFICATION_CONFIGS } from '@api-service/src/events/alert-classification-config.mock';
import { AlertClassificationConfig } from '@api-service/src/events/interfaces/alert-classification-config';

@Injectable()
export class AlertClassificationConfigsService {
  public getByHazardType(
    hazardType: string,
  ): AlertClassificationConfig | undefined {
    return MOCK_ALERT_CLASSIFICATION_CONFIGS[hazardType];
  }
}
