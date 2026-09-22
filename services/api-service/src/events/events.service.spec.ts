import { Test } from '@nestjs/testing';
import { Event } from '@prisma/client';

import {
  EventFloodsDetailsService,
  FloodsDetailsContext,
} from '@api-service/src/events/event-floods-details.service';
import {
  EventsRepository,
  ExposedAdminAreaRecord,
} from '@api-service/src/events/events.repository';
import { EventsService } from '@api-service/src/events/events.service';
import {
  AlertClass,
  EventStatus,
  HazardType,
  LayerName,
} from '@api-service/src/shared-enums';

function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    created: new Date('2026-03-23T12:00:00Z'),
    updated: new Date('2026-03-23T12:00:00Z'),
    countryCodeIso3: 'ETH',
    eventName: 'station-A',
    hazardType: HazardType.floods,
    forecastSources: ['glofas'],
    alertClass: AlertClass.medium,
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
  let floodsDetailsService: jest.Mocked<EventFloodsDetailsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: EventsRepository,
          useValue: {
            getEvents: jest.fn(),
            getExposedAdminAreasForLatestAlerts: jest.fn(),
            getRasterIdsForLatestAlerts: jest.fn(),
          },
        },
        {
          provide: EventFloodsDetailsService,
          useValue: {
            buildContext: jest.fn(),
            buildDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EventsService);
    repository = module.get(EventsRepository);
    floodsDetailsService = module.get(EventFloodsDetailsService);
    repository.getRasterIdsForLatestAlerts.mockResolvedValue(new Map());
    floodsDetailsService.buildContext.mockResolvedValue(
      {} as unknown as FloodsDetailsContext,
    );
    floodsDetailsService.buildDetails.mockReturnValue(null);
  });

  describe('getEvents', () => {
    it('should return centroid as { latitude, longitude } object', async () => {
      const event = buildEvent({
        centroid: { latitude: 0.35, longitude: 32.6 },
      });
      repository.getEvents.mockResolvedValue([event]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(result[0].centroid).toEqual({ latitude: 0.35, longitude: 32.6 });
    });

    it('should return date fields as ISO strings', async () => {
      repository.getEvents.mockResolvedValue([buildEvent()]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

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

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(result[0].hazardType).toEqual(HazardType.floods);
    });

    it('should return exposedAdminAreas grouped by adminLevel', async () => {
      const event = buildEvent({ id: 42 });
      const exposedAreas: ExposedAdminAreaRecord[] = [
        {
          placeCode: 'KEN_01',
          adminLevel: 1,
          name: 'Region A',
          exposure: [{ layerName: LayerName.exposedPopulation, exposed: 500 }],
        },
        {
          placeCode: 'KEN_01_001',
          adminLevel: 3,
          name: 'District X',
          exposure: [{ layerName: LayerName.exposedPopulation, exposed: 200 }],
        },
        {
          placeCode: 'KEN_01_002',
          adminLevel: 3,
          name: 'District Y',
          exposure: [{ layerName: LayerName.exposedPopulation, exposed: 300 }],
        },
      ];
      repository.getEvents.mockResolvedValue([event]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map([[42, exposedAreas]]),
      );

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(result[0].exposedAdminAreas).toEqual({
        1: [
          {
            placeCode: 'KEN_01',
            adminLevel: 1,
            name: 'Region A',
            exposure: [
              {
                layerName: LayerName.exposedPopulation,
                total: null,
                exposed: 500,
              },
            ],
          },
        ],
        3: [
          {
            placeCode: 'KEN_01_001',
            adminLevel: 3,
            name: 'District X',
            exposure: [
              {
                layerName: LayerName.exposedPopulation,
                total: null,
                exposed: 200,
              },
            ],
          },
          {
            placeCode: 'KEN_01_002',
            adminLevel: 3,
            name: 'District Y',
            exposure: [
              {
                layerName: LayerName.exposedPopulation,
                total: null,
                exposed: 300,
              },
            ],
          },
        ],
      });
    });

    it('should return eventStatus ended when endAt equals the view time', async () => {
      repository.getEvents.mockResolvedValue([buildEvent()]);
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );

      const result = await service.getEvents({
        viewTime: new Date('2026-03-26T00:00:00Z'),
      });

      expect(result[0].eventStatus).toBe(EventStatus.ended);
    });
  });

  describe('getEvents – hazardDetails dispatch', () => {
    beforeEach(() => {
      repository.getExposedAdminAreasForLatestAlerts.mockResolvedValue(
        new Map(),
      );
    });

    it('should delegate flood events to EventFloodsDetailsService and surface the result on hazardTypeDetails.floods', async () => {
      repository.getEvents.mockResolvedValue([
        buildEvent({ id: 42, hazardType: HazardType.floods }),
      ]);
      const stubDetails = { geoFeatureId: 'G1' } as never;
      floodsDetailsService.buildDetails.mockReturnValue(stubDetails);

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(floodsDetailsService.buildContext).toHaveBeenCalledTimes(1);
      expect(floodsDetailsService.buildDetails).toHaveBeenCalledTimes(1);
      expect(result[0].hazardTypeDetails.floods).toBe(stubDetails);
    });

    it('should omit floods key when EventFloodsDetailsService returns null', async () => {
      repository.getEvents.mockResolvedValue([
        buildEvent({ id: 42, hazardType: HazardType.floods }),
      ]);
      floodsDetailsService.buildDetails.mockReturnValue(null);

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(result[0].hazardTypeDetails).toEqual({});
    });

    it('should skip the flood context build when there are no flood events', async () => {
      repository.getEvents.mockResolvedValue([
        buildEvent({ id: 42, hazardType: HazardType.drought }),
      ]);

      const result = await service.getEvents({
        viewTime: new Date('2026-03-25T12:00:00Z'),
      });

      expect(floodsDetailsService.buildContext).not.toHaveBeenCalled();
      expect(floodsDetailsService.buildDetails).not.toHaveBeenCalled();
      expect(result[0].hazardTypeDetails).toEqual({});
    });
  });
});
