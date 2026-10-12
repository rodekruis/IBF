import { Module } from '@nestjs/common';

import { EventsModule } from '@api-service/src/events/events.module';
import { TeamsNotificationsService } from '@api-service/src/notifications/teams-notifications.service';

@Module({
  imports: [EventsModule],
  providers: [TeamsNotificationsService],
  exports: [TeamsNotificationsService],
})
export class NotificationsModule {}
