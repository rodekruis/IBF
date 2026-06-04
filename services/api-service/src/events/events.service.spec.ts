import { Test } from '@nestjs/testing';
import { Event } from '@prisma/client';

import { EventsRepository } from '@api-service/src/events/events.repository';
import { EventsService } from '@api-service/src/events/events.service';
import { HazardType, Layer } from '@api-service/src/shared-enums';

function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    created: new Date('2026-03-23T12:00:00Z'),
    updated: new Date('2026-03-23T12:00:00Z'),
    eventName: 'ETH_floods_station-A',
    hazardType: HazardType.floods,
    forecastSources: ['glofas'],
    alertClass: 'med',
    trigger: false,
    centroid: { latitude: 0.35, longitude: 32.6 },
    startAt: new Date('2026-03-25T00:00:00Z'),
    reachesPeakAlertClassAt: new Date('2026-03-25T12:00:00Z'),
    endAt: new Date('2026-03-26T00:00:00Z'),
    firstIssuedAt: new Date('2026-03-23T12:00:00Z'),
    lastUpdatedAt: new Date('2026-03-23T12:00:00Z'),
    closedAt: null,
    ...overrides,
  };
}

describe('EventsService', () => {
  let service: EventsService;
  let repository: jest.Mocked<EventsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: EventsRepository,
          useValue: {
            getEvents: jest.fn(),
            getExposedAdminAreasForLatestAlerts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EventsService);
    repository = module.get(EventsRepository);
  });

  describe('getEvents', () => {
    it('should return centroid as [longitude, latitude]', async () => {
      const event = buildEvent({
        centroid: { latitude: 0.35, longitude: 32.6 },
      });
      repository.getEvents.mockResolvedValue([event]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents(new Date('2026-03-25T12:00:00Z'));

      expect(result[0].centroid).toEqual([32.6, 0.35]);
    });

    it('should return date fields as ISO strings', async () => {
      repository.getEvents.mockResolvedValue([buildEvent()]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents(new Date('2026-03-25T12:00:00Z'));

      expect(result[0].startAt).toBe('2026-03-25T00:00:00.000Z');
      expect(result[0].reachesPeakAlertClassAt).toBe(
        '2026-03-25T12:00:00.000Z',
      );
      expect(result[0].endAt).toBe('2026-03-26T00:00:00.000Z');
      expect(result[0].firstIssuedAt).toBe('2026-03-23T12:00:00.000Z');
      expect(result[0].lastUpdatedAt).toBe('2026-03-23T12:00:00.000Z');
    });

    it('should return hazardType as a single-element array', async () => {
      repository.getEvents.mockResolvedValue([
        buildEvent({ hazardType: HazardType.floods }),
      ]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents(new Date('2026-03-25T12:00:00Z'));

      expect(result[0].hazardType).toEqual([HazardType.floods]);
    });

    it('should set exposure unit based on layer type', async () => {
      const event = buildEvent();
      repository.getEvents.mockResolvedValue([event]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map([
          [
            event.id,
            [
              {
                placeCode: 'ETH_01',
                adminLevel: 1,
                name: 'Region A',
                exposure: [{ type: Layer.populationExposed, exposed: 1000 }],
              },
            ],
          ],
        ]),
      );

      const result = await service.getEvents(new Date('2026-03-25T12:00:00Z'));

      expect(result[0].exposedAdminAreas[0].exposure[0].unit).toBe('people');
    });
  });
});
