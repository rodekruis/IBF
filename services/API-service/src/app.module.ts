import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule as TypeORMNestJS } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppController } from '@API-service/src/app.controller';
import { AuthModule } from '@API-service/src/auth/auth.module';
import { THROTTLING_LIMIT_GENERIC } from '@API-service/src/config';
import { HealthModule } from '@API-service/src/health/health.module';
import { ScriptsModule } from '@API-service/src/scripts/scripts.module';
import { TypeOrmModule } from '@API-service/src/typeorm.module';

@Module({
  // Note: no need to import just any (new) Module in ApplicationModule, when another Module already imports it
  imports: [
    TypeOrmModule,
    TypeORMNestJS.forFeature([]),
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
  constructor(private dataSource: DataSource) {}

  public async onApplicationBootstrap(): Promise<void> {
    // Always start with running (all) migrations (not handled automatically via TypeORM)
    await this.dataSource.runMigrations();
  }
}
