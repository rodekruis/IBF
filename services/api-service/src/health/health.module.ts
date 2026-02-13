import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@api-service/src/health/health.controller';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

@Module({
  providers: [PrismaService],
  controllers: [HealthController],
  imports: [TerminusModule],
})
export class HealthModule {}
