import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminAreasModule } from '@api-service/src/admin-areas/admin-areas.module';
import { AlertConfigsModule } from '@api-service/src/alert-configs/alert-configs.module';
import { AlertsModule } from '@api-service/src/alerts/alerts.module';
import { AppController } from '@api-service/src/app.controller';
import { AuthModule } from '@api-service/src/auth/auth.module';
import { THROTTLING_LIMIT_GENERIC } from '@api-service/src/config';
import { CountriesModule } from '@api-service/src/countries/countries.module';
import { EventsModule } from '@api-service/src/events/events.module';
import { HealthModule } from '@api-service/src/health/health.module';
import { ScriptsModule } from '@api-service/src/scripts/scripts.module';

@Module({
  imports: [
    HealthModule,
    ScriptsModule,
    MulterModule.register({
      dest: './files',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        limit: THROTTLING_LIMIT_GENERIC.default.limit,
        ttl: THROTTLING_LIMIT_GENERIC.default.ttl,
      },
    ]),
    AuthModule,
    AlertConfigsModule,
    AlertsModule,
    AdminAreasModule,
    CountriesModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApplicationModule implements OnApplicationBootstrap {
  public async onApplicationBootstrap(): Promise<void> {
    // Init logic if needed
  }
}
