import { Module } from '@nestjs/common';

import { AlertsController } from '@api-service/src/alerts/alerts.controller';
import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { EventsModule } from '@api-service/src/events/events.module';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventsModule],
  providers: [AlertsService, AlertsRepository],
  controllers: [AlertsController],
})
export class AlertsModule {}
