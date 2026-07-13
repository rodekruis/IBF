import { Module } from '@nestjs/common';

import { AdminAreasModule } from '@api-service/src/admin-areas/admin-areas.module';
import { AlertConfigsModule } from '@api-service/src/alert-configs/alert-configs.module';
import { AlertsModule } from '@api-service/src/alerts/alerts.module';
import { CountriesModule } from '@api-service/src/countries/countries.module';
import { EventsModule } from '@api-service/src/events/events.module';
import { GeoFeaturesModule } from '@api-service/src/geo-features/geo-features.module';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { RastersModule } from '@api-service/src/rasters/rasters.module';
import { SeedController } from '@api-service/src/seed/seed.controller';
import { SeedService } from '@api-service/src/seed/seed.service';
import { SeedInit } from '@api-service/src/seed/seed-init';

@Module({
  imports: [
    PrismaModule,
    AlertsModule,
    AdminAreasModule,
    AlertConfigsModule,
    CountriesModule,
    EventsModule,
    GeoFeaturesModule,
    RastersModule,
  ],
  providers: [SeedService, SeedInit],
  controllers: [SeedController],
})
export class SeedModule {}
