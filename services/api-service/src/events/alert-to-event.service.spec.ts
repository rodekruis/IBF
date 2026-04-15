import { Test } from '@nestjs/testing';

import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';
import { EventsRepository } from '@api-service/src/events/events.repository';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';
import { buildAlert } from '@api-service/test/helpers/alert.helper';

function buildClassificationResult(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    alertClassPerTimeInterval: new Map([['2026-04-01T00:00:00Z', 'max']]),
    alertClass: 'max',
    startAt: new Date('2026-04-01T00:00:00Z'),
    endAt: new Date('2026-04-02T00:00:00Z'),
    reachesPeakAlertClassAt: new Date('2026-04-01T00:00:00Z'),
    trigger: true,
    ...overrides,
  };
}

describe('AlertToEventService', () => {
  let service: AlertToEventService;
  let classificationService: jest.Mocked<AlertClassificationService>;
  let repository: jest.Mocked<EventsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AlertToEventService,
        {
          provide: AlertClassificationService,
          useValue: { classifyAlert: jest.fn() },
        },
        {
          provide: EventsRepository,
          useValue: {
            getOpenEventByName: jest.fn(),
            getAlertHistoryForEvent: jest.fn(),
            createEvent: jest.fn(),
            updateEvent: jest.fn(),
            closeOpenEventsByName: jest.fn(),
            closeStaleOpenEvents: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AlertToEventService);
    classificationService = module.get(AlertClassificationService);
    repository = module.get(EventsRepository);
  });

  describe('matchAndStore', () => {
    it('should propagate error when classification throws', async () => {
      classificationService.classifyAlert.mockImplementation(() => {
        throw new Error('No classification config found');
      });

      await expect(service.matchAndStore(buildAlert())).rejects.toThrow(
        'No classification config found',
      );
      expect(repository.createEvent).not.toHaveBeenCalled();
    });

    it('should close existing event and skip creation when alertClass is null', async () => {
      classificationService.classifyAlert.mockReturnValue(
        buildClassificationResult({ alertClass: null }),
      );

      const alert = buildAlert();
      await service.matchAndStore(alert);

      expect(repository.closeOpenEventsByName).toHaveBeenCalledWith(
        alert.alertName,
        new Date(alert.issuedAt),
      );
      expect(repository.createEvent).not.toHaveBeenCalled();
      expect(repository.updateEvent).not.toHaveBeenCalled();
    });

    it('should create a new event when no open event exists', async () => {
      const classification = buildClassificationResult();
      classificationService.classifyAlert.mockReturnValue(classification);
      repository.getOpenEventByName.mockResolvedValue(null);

      const alert = buildAlert();
      await service.matchAndStore(alert);

      expect(repository.createEvent).toHaveBeenCalledWith({
        eventName: alert.alertName,
        hazardTypes: alert.hazardTypes,
        forecastSources: alert.forecastSources,
        alertClass: 'max',
        trigger: true,
        startAt: classification.startAt,
        reachesPeakAlertClassAt: classification.reachesPeakAlertClassAt,
        endAt: classification.endAt,
        firstIssuedAt: new Date(alert.issuedAt),
      });
    });

    it('should set event startAt to latest alert startAt when no history is ongoing', async () => {
      const classification = buildClassificationResult({
        startAt: new Date('2026-04-08T00:00:00Z'),
        endAt: new Date('2026-04-06T00:00:00Z'),
      });
      classificationService.classifyAlert
        .mockReturnValueOnce(classification)
        .mockReturnValueOnce(
          buildClassificationResult({
            startAt: new Date('2026-04-10T00:00:00Z'),
          }),
        );

      const existingEvent = {
        id: 42,
        created: new Date(),
        updated: new Date(),
        eventName: 'KEN_floods_station-A',
        hazardTypes: [HazardType.floods],
        forecastSources: [ForecastSource.glofas],
        alertClass: 'med',
        trigger: false,
        startAt: new Date('2026-04-03T00:00:00Z'),
        reachesPeakAlertClassAt: new Date('2026-04-03T00:00:00Z'),
        endAt: new Date('2026-04-04T00:00:00Z'),
        firstIssuedAt: new Date('2026-03-28T00:00:00Z'),
        closedAt: null,
      };
      repository.getOpenEventByName.mockResolvedValue(existingEvent);
      repository.getAlertHistoryForEvent.mockResolvedValue([
        {
          issuedAt: new Date('2026-04-01T00:00:00Z'),
          hazardTypes: [HazardType.floods],
          severityData: [],
        },
      ]);

      await service.matchAndStore(buildAlert());

      expect(repository.updateEvent).toHaveBeenCalledWith(42, {
        alertClass: 'max',
        trigger: true,
        startAt: new Date('2026-04-08T00:00:00Z'),
        reachesPeakAlertClassAt: classification.reachesPeakAlertClassAt,
        endAt: classification.endAt,
      });
    });

    it('should set event startAt to first ongoing historical alert startAt when history is ongoing', async () => {
      const classification = buildClassificationResult({
        startAt: new Date('2026-04-08T00:00:00Z'),
      });
      classificationService.classifyAlert
        .mockReturnValueOnce(classification)
        .mockReturnValueOnce(
          buildClassificationResult({
            startAt: new Date('2026-04-03T00:00:00Z'),
          }),
        )
        .mockReturnValueOnce(
          buildClassificationResult({
            startAt: new Date('2026-03-27T00:00:00Z'),
          }),
        );

      const existingEvent = {
        id: 42,
        created: new Date(),
        updated: new Date(),
        eventName: 'KEN_floods_station-A',
        hazardTypes: [HazardType.floods],
        forecastSources: [ForecastSource.glofas],
        alertClass: 'med',
        trigger: false,
        startAt: new Date('2026-04-01T00:00:00Z'),
        reachesPeakAlertClassAt: new Date('2026-04-01T00:00:00Z'),
        endAt: new Date('2026-04-04T00:00:00Z'),
        firstIssuedAt: new Date('2026-03-28T00:00:00Z'),
        closedAt: null,
      };
      repository.getOpenEventByName.mockResolvedValue(existingEvent);
      repository.getAlertHistoryForEvent.mockResolvedValue([
        {
          issuedAt: new Date('2026-03-30T00:00:00Z'),
          hazardTypes: [HazardType.floods],
          severityData: [],
        },
        {
          issuedAt: new Date('2026-04-01T00:00:00Z'),
          hazardTypes: [HazardType.floods],
          severityData: [],
        },
      ]);

      await service.matchAndStore(
        buildAlert({ issuedAt: new Date('2026-04-02T00:00:00Z') }),
      );

      expect(repository.updateEvent).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          startAt: new Date('2026-03-27T00:00:00Z'),
        }),
      );
    });
  });
});
