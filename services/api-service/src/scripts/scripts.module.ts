import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AdminAreasModule } from '@api-service/src/admin-areas/admin-areas.module';
import { AlertConfigsModule } from '@api-service/src/alert-configs/alert-configs.module';
import { AlertsModule } from '@api-service/src/alerts/alerts.module';
import { CountriesModule } from '@api-service/src/countries/countries.module';
import { GeoFeaturesModule } from '@api-service/src/geo-features/geo-features.module';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { RastersModule } from '@api-service/src/rasters/rasters.module';
import { ScriptsController } from '@api-service/src/scripts/scripts.controller';
import { ScriptsService } from '@api-service/src/scripts/scripts.service';
import { SeedInit } from '@api-service/src/scripts/seed-init';
import { CustomHttpService } from '@api-service/src/shared/services/custom-http.service';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    AlertsModule,
    AdminAreasModule,
    AlertConfigsModule,
    CountriesModule,
    GeoFeaturesModule,
    RastersModule,
  ],
  providers: [ScriptsService, SeedInit, CustomHttpService],
  controllers: [ScriptsController],
})
export class ScriptsModule {}
