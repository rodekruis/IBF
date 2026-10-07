import { Test } from '@nestjs/testing';

jest.mock('@api-service/src/env', () => ({
  env: {
    TEAMS_NOTIFICATIONS_ENABLED: true,
    TEAMS_NOTIFICATIONS_WEBHOOK_URL: undefined as string | undefined,
    ENV_NAME: undefined as string | undefined,
    TEAMS_NOTIFICATIONS_MENTION_EMAILS: [] as string[],
    REDIRECT_PORTAL_URL_HOST: 'https://nrw.example.org',
  },
}));

const mockEnv = jest.requireMock<{
  env: {
    TEAMS_NOTIFICATIONS_ENABLED: boolean;
    TEAMS_NOTIFICATIONS_WEBHOOK_URL: string | undefined;
    ENV_NAME: string | undefined;
    TEAMS_NOTIFICATIONS_MENTION_EMAILS: string[];
  };
}>('@api-service/src/env').env;

import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { EventsService } from '@api-service/src/events/events.service';
import { TeamsMessage } from '@api-service/src/notifications/interfaces/teams-message';
import { NotificationsService } from '@api-service/src/notifications/notifications.service';
import {
  AlertClass,
  EventStatus,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';

const WEBHOOK_URL = 'https://teams.example.org/webhook';
const ISSUED_AT = '2026-03-20T12:00:00.000Z';
const PREVIOUS_ISSUED_AT = '2026-03-19T12:00:00.000Z';

function createForecast(): ForecastCreateDto {
  return {
    countryCodeIso3: 'ETH',
    issuedAt: new Date(ISSUED_AT),
    hazardType: HazardType.floods,
    forecastSources: [ForecastSource.glofas],
    alerts: [],
  };
}

function createEvent(overrides: Partial<EventResponseDto>): EventResponseDto {
  return {
    eventId: 1,
    countryCodeIso3: 'ETH',
    eventName: 'station-A',
    eventLabel: 'station-A',
    hazardType: HazardType.floods,
    forecastSources: [ForecastSource.glofas],
    alertClass: AlertClass.high,
    trigger: true,
    centroid: { latitude: 0.35, longitude: 32.6 },
    startAt: '2026-03-22T00:00:00.000Z',
    reachesPeakAlertClassAt: '2026-03-23T00:00:00.000Z',
    endAt: '2026-03-25T00:00:00.000Z',
    firstIssuedAt: ISSUED_AT,
    lastUpdatedAt: ISSUED_AT,
    eventStatus: EventStatus.imminent,
    exposedAdminAreas: {},
    availableLayers: [],
    hazardTypeDetails: {},
    ...overrides,
  };
}

function getPostedMessage(fetchMock: jest.Mock): TeamsMessage {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as TeamsMessage;
}

function getTitle(message: TeamsMessage): string {
  const titleBlock = message.attachments[0].content.body[0];
  return titleBlock.type === 'TextBlock' ? titleBlock.text : '';
}

function getEventHeaders(message: TeamsMessage): string[] {
  return message.attachments[0].content.body.flatMap((element) => {
    if (element.type !== 'Container') {
      return [];
    }
    const header = element.items[0];
    return header.type === 'TextBlock' ? [header.text] : [];
  });
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let eventsService: { getEvents: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    mockEnv.TEAMS_NOTIFICATIONS_ENABLED = true;
    mockEnv.TEAMS_NOTIFICATIONS_WEBHOOK_URL = WEBHOOK_URL;
    mockEnv.ENV_NAME = undefined;
    mockEnv.TEAMS_NOTIFICATIONS_MENTION_EMAILS = [];
    eventsService = { getEvents: jest.fn().mockResolvedValue([]) };
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('should do nothing when no webhook URL is configured', async () => {
    // Arrange
    mockEnv.TEAMS_NOTIFICATIONS_WEBHOOK_URL = undefined;

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    expect(eventsService.getEvents).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should do nothing when notifications are disabled', async () => {
    // Arrange
    mockEnv.TEAMS_NOTIFICATIONS_ENABLED = false;

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    expect(service.isEnabled()).toBe(false);
    expect(eventsService.getEvents).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should post one message per forecast listing its new, continued and closed events', async () => {
    // Arrange
    eventsService.getEvents.mockResolvedValue([
      createEvent({ eventId: 1, eventLabel: 'new-station' }),
      createEvent({
        eventId: 2,
        eventLabel: 'continued-station',
        firstIssuedAt: PREVIOUS_ISSUED_AT,
      }),
      createEvent({
        eventId: 3,
        eventLabel: 'closed-station',
        firstIssuedAt: PREVIOUS_ISSUED_AT,
        eventStatus: EventStatus.ended,
      }),
      createEvent({
        eventId: 4,
        eventLabel: 'other-hazard',
        hazardType: HazardType.drought,
      }),
    ]);

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    expect(eventsService.getEvents).toHaveBeenCalledWith({
      viewTime: new Date(ISSUED_AT),
      countryCodesIso3: ['ETH'],
      lastUpdatedAt: new Date(ISSUED_AT),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(WEBHOOK_URL);
    const message = getPostedMessage(fetchMock);
    expect(getTitle(message)).toBe(
      'floods in ETH: 1 new, 1 updated, 1 closed events',
    );
    expect(getEventHeaders(message)).toEqual([
      'New: new-station',
      'Updated: continued-station',
      'Closed: closed-station',
    ]);
  });

  it('should not post a message when the forecast updated no events', async () => {
    // Arrange
    eventsService.getEvents.mockResolvedValue([]);

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should prefix the title with the environment name when configured', async () => {
    // Arrange
    mockEnv.ENV_NAME = 'TEST';
    eventsService.getEvents.mockResolvedValue([createEvent({})]);

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    expect(getTitle(getPostedMessage(fetchMock))).toBe(
      '[TEST] floods in ETH: 1 new, 0 updated, 0 closed events',
    );
  });

  it('should mention configured people', async () => {
    // Arrange
    mockEnv.TEAMS_NOTIFICATIONS_MENTION_EMAILS = ['person@example.org'];
    eventsService.getEvents.mockResolvedValue([createEvent({})]);

    // Act
    await service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    const card = getPostedMessage(fetchMock).attachments[0].content;
    expect(card.body).toContainEqual(
      expect.objectContaining({ text: '<at>person@example.org</at>' }),
    );
    expect(card.msteams.entities).toEqual([
      {
        type: 'mention',
        text: '<at>person@example.org</at>',
        mentioned: { id: 'person@example.org', name: 'person@example.org' },
      },
    ]);
  });

  it('should not throw when the webhook responds with an error', async () => {
    // Arrange
    eventsService.getEvents.mockResolvedValue([createEvent({})]);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('error'),
    });

    // Act
    const notify = service.notifyEventsUpdatedByForecast(createForecast());

    // Assert
    await expect(notify).resolves.toBeUndefined();
  });
});
