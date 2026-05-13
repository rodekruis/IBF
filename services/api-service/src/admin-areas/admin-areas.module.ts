import { Module } from '@nestjs/common';

import { AdminAreasController } from '@api-service/src/admin-areas/admin-areas.controller';
import { AdminAreasRepository } from '@api-service/src/admin-areas/admin-areas.repository';
import { AdminAreasService } from '@api-service/src/admin-areas/admin-areas.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AdminAreasService, AdminAreasRepository],
  controllers: [AdminAreasController],
  exports: [AdminAreasService],
})
export class AdminAreasModule {}
