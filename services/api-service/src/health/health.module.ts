import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@api-service/src/health/health.controller';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule, PrismaModule],
})
export class HealthModule {}
