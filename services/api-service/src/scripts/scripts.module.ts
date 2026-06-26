import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AlertsModule } from '@api-service/src/alerts/alerts.module';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { ScriptsController } from '@api-service/src/scripts/scripts.controller';
import { ScriptsService } from '@api-service/src/scripts/scripts.service';
import { SeedInit } from '@api-service/src/scripts/seed-init';
import { CustomHttpService } from '@api-service/src/shared/services/custom-http.service';

@Module({
  imports: [HttpModule, PrismaModule, AlertsModule],
  providers: [ScriptsService, SeedInit, CustomHttpService],
  controllers: [ScriptsController],
})
export class ScriptsModule {}
