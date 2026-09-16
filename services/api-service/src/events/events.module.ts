import { Module } from '@nestjs/common';

import { AlertConfigsModule } from '@api-service/src/alert-configs/alert-configs.module';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';
import { EventFloodsDataService } from '@api-service/src/events/event-floods-data.service';
import { EventsController } from '@api-service/src/events/events.controller';
import { EventsRepository } from '@api-service/src/events/events.repository';
import { EventsService } from '@api-service/src/events/events.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, AlertConfigsModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsRepository,
    AlertClassificationService,
    AlertToEventService,
    EventFloodsDataService,
  ],
  exports: [AlertToEventService, EventsService],
})
export class EventsModule {}
