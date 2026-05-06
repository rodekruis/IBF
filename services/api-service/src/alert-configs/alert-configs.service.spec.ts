import { Test } from '@nestjs/testing';

import { AlertConfigsRepository } from '@api-service/src/alert-configs/alert-configs.repository';
import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';

const mockAlertConfig: AlertConfigResponseDto = {
  id: 1,
  created: new Date(),
  updated: new Date(),
  countryCodeIso3: 'KEN',
  hazardType: HazardType.floods,
  spatialExtentName: 'G5142',
  spatialExtentPlaceCodes: ['KE030'],
  temporalExtents: [
    {
      'lead-time-spectrum': [
        '0-day',
        '1-day',
        '2-day',
        '3-day',
        '4-day',
        '5-day',
        '6-day',
        '7-day',
      ],
    },
  ],
  severityClassLevels: [
    { label: 'low', threshold: 100 },
    { label: 'med', threshold: 200 },
    { label: 'high', threshold: 400 },
  ],
  probabilityClassLevels: [
    { label: 'low', threshold: 0.5 },
    { label: 'med', threshold: 0.65 },
    { label: 'high', threshold: 0.85 },
  ],
  alertClassMatrix: {
    low: { low: 'low', med: 'low', high: 'med' },
    med: { low: 'low', med: 'med', high: 'high' },
    high: { low: 'med', med: 'high', high: 'high' },
  },
  alertClassOrder: ['low', 'med', 'high'],
  triggerAlertClass: 'high',
  triggerLeadTimeDuration: 'P7D',
};

describe('AlertConfigsService', () => {
  let service: AlertConfigsService;
  let repository: AlertConfigsRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AlertConfigsService,
        {
          provide: AlertConfigsRepository,
          useValue: {
            getAlertConfigs: jest.fn().mockResolvedValue([mockAlertConfig]),
          },
        },
      ],
    }).compile();

    service = module.get(AlertConfigsService);
    repository = module.get(AlertConfigsRepository);
  });

  it('should return alert configs by country and hazard type', async () => {
    const result = await service.getAlertConfigs({
      countryCodeIso3: 'KEN',
      hazardType: HazardType.floods,
    });
    expect(result).toEqual([mockAlertConfig]);
    expect(repository.getAlertConfigs).toHaveBeenCalledWith({
      countryCodeIso3: 'KEN',
      hazardType: HazardType.floods,
    });
  });
});
