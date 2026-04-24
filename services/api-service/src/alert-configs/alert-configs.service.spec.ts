import { Test } from '@nestjs/testing';

import { AlertConfigsRepository } from '@api-service/src/alert-configs/alert-configs.repository';
import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';

const mockAlertConfig: AlertConfigResponseDto = {
  id: 1,
  countryCodeIso3: 'KEN',
  hazardType: 'floods',
  spatialExtentName: 'G5142',
  spatialExtentPlaceCodes: ['KE030'],
  temporalExtents: [
    {
      'lead-time-spectrum': [
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
      hazardType: 'floods',
    });
    expect(result).toEqual([mockAlertConfig]);
    expect(repository.getAlertConfigs).toHaveBeenCalledWith({
      countryCodeIso3: 'KEN',
      hazardType: 'floods',
    });
  });
});
