import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from '@api-service/src/app.controller';
import { AuthModule } from '@api-service/src/auth/auth.module';
import { THROTTLING_LIMIT_GENERIC } from '@api-service/src/config';
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
