import { Module } from '@nestjs/common';

import { EventsModule } from '@api-service/src/events/events.module';
import { NotificationsService } from '@api-service/src/notifications/notifications.service';

@Module({
  imports: [EventsModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
