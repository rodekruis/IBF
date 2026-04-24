import { Module } from '@nestjs/common';

import { AlertConfigsController } from '@api-service/src/alert-configs/alert-configs.controller';
import { AlertConfigsRepository } from '@api-service/src/alert-configs/alert-configs.repository';
import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AlertConfigsService, AlertConfigsRepository],
  controllers: [AlertConfigsController],
  exports: [AlertConfigsService],
})
export class AlertConfigsModule {}
