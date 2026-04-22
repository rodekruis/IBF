import { Module } from '@nestjs/common';

import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationConfigsService } from '@api-service/src/events/alert-classification-configs.service';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';
import { EventsController } from '@api-service/src/events/events.controller';
import { EventsRepository } from '@api-service/src/events/events.repository';
import { EventsService } from '@api-service/src/events/events.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsRepository,
    AlertClassificationConfigsService,
    AlertClassificationService,
    AlertToEventService,
  ],
  exports: [AlertToEventService],
})
export class EventsModule {}
