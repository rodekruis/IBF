import { Injectable, Logger } from '@nestjs/common';

import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { env } from '@api-service/src/env';
import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { EventsService } from '@api-service/src/events/events.service';
import { EventChange } from '@api-service/src/notifications/enum/event-change.enum';
import {
  TeamsContainer,
  TeamsFact,
  TeamsMention,
  TeamsMessage,
  TeamsTextBlock,
} from '@api-service/src/notifications/interfaces/teams-message';
import { EventStatus } from '@api-service/src/shared-enums';

const TEAMS_REQUEST_TIMEOUT_MS = 10_000;

// TODO: this should be considered as a temporary implementation until a full-fledged notification system is in place.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  public constructor(private readonly eventsService: EventsService) {}

  public isEnabled(): boolean {
    return !!this.getEnabledWebhookUrl();
  }

  public async notifyEventsUpdatedByForecast(
    forecast: ForecastCreateDto,
  ): Promise<void> {
    const webhookUrl = this.getEnabledWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    try {
      const events = await this.getEventsUpdatedByForecast(forecast);
      if (events.length === 0) {
        return;
      }
      await this.postTeamsMessage({
        webhookUrl,
        message: this.buildTeamsMessage({ forecast, events }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send Teams notification for ${forecast.countryCodeIso3} ${forecast.hazardType} forecast issued at ${forecast.issuedAt.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private getEnabledWebhookUrl(): string | undefined {
    return env.TEAMS_NOTIFICATIONS_ENABLED
      ? env.TEAMS_NOTIFICATIONS_WEBHOOK_URL
      : undefined;
  }

  private async getEventsUpdatedByForecast(
    forecast: ForecastCreateDto,
  ): Promise<EventResponseDto[]> {
    const events = await this.eventsService.getEvents({
      viewTime: forecast.issuedAt,
      countryCodesIso3: [forecast.countryCodeIso3],
      lastUpdatedAt: forecast.issuedAt,
    });
    return events.filter((event) => event.hazardType === forecast.hazardType);
  }

  private buildTeamsMessage({
    forecast,
    events,
  }: {
    forecast: ForecastCreateDto;
    events: EventResponseDto[];
  }): TeamsMessage {
    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: this.buildTitle({ forecast, events }),
                weight: 'Bolder',
                size: 'Large',
                color: 'Attention',
                wrap: true,
              },
              ...this.buildMentionTextBlocks(),
              {
                type: 'TextBlock',
                text: `Forecast issued at ${forecast.issuedAt.toISOString()}`,
                isSubtle: true,
                wrap: true,
              },
              ...events.map((event) => this.buildEventContainer(event)),
            ],
            actions: [
              {
                type: 'Action.OpenUrl',
                title: 'Open National Risk Watch',
                url: env.REDIRECT_PORTAL_URL_HOST,
              },
            ],
            msteams: { entities: this.buildMentionEntities() },
          },
        },
      ],
    };
  }

  private buildMentionTextBlocks(): TeamsTextBlock[] {
    const emails = env.TEAMS_NOTIFICATIONS_MENTION_EMAILS;
    if (emails.length === 0) {
      return [];
    }
    return [
      {
        type: 'TextBlock',
        text: emails.map((email) => this.getMentionText(email)).join(' '),
        wrap: true,
      },
    ];
  }

  private buildMentionEntities(): TeamsMention[] {
    return env.TEAMS_NOTIFICATIONS_MENTION_EMAILS.map((email) => ({
      type: 'mention',
      text: this.getMentionText(email),
      mentioned: { id: email, name: email },
    }));
  }

  private getMentionText(email: string): string {
    return `<at>${email}</at>`;
  }

  private buildTitle({
    forecast,
    events,
  }: {
    forecast: ForecastCreateDto;
    events: EventResponseDto[];
  }): string {
    const prefix = env.ENV_NAME ? `[${env.ENV_NAME}] ` : '';
    const countByChange = (change: EventChange): number =>
      events.filter((event) => this.getEventChange(event) === change).length;
    return `${prefix}${forecast.hazardType} in ${forecast.countryCodeIso3}: ${countByChange(EventChange.new)} new, ${countByChange(EventChange.updated)} updated, ${countByChange(EventChange.closed)} closed events`;
  }

  private buildEventContainer(event: EventResponseDto): TeamsContainer {
    return {
      type: 'Container',
      separator: true,
      items: [
        {
          type: 'TextBlock',
          text: `${this.getEventChange(event)}: ${event.eventLabel}`,
          weight: 'Bolder',
          size: 'Medium',
          wrap: true,
        },
        { type: 'FactSet', facts: this.buildFacts(event) },
      ],
    };
  }

  private getEventChange(event: EventResponseDto): EventChange {
    if (event.eventStatus === EventStatus.ended) {
      return EventChange.closed;
    }
    if (event.firstIssuedAt === event.lastUpdatedAt) {
      return EventChange.new;
    }
    return EventChange.updated;
  }

  private buildFacts(event: EventResponseDto): TeamsFact[] {
    return [
      { title: 'Alert class', value: event.alertClass },
      { title: 'Trigger', value: event.trigger ? 'Yes' : 'No' },
      { title: 'Status', value: event.eventStatus },
      { title: 'Start', value: event.startAt },
      { title: 'First issued', value: event.firstIssuedAt },
    ];
  }

  private async postTeamsMessage({
    webhookUrl,
    message,
  }: {
    webhookUrl: string;
    message: TeamsMessage;
  }): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(TEAMS_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Teams webhook responded with ${response.status}: ${await response.text()}`,
      );
    }
  }
}
