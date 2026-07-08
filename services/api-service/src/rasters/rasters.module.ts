import { Module } from '@nestjs/common';

import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { RastersController } from '@api-service/src/rasters/rasters.controller';
import { RastersRepository } from '@api-service/src/rasters/rasters.repository';
import { RastersService } from '@api-service/src/rasters/rasters.service';

@Module({
  imports: [PrismaModule],
  controllers: [RastersController],
  providers: [RastersService, RastersRepository],
  exports: [RastersService],
})
export class RastersModule {}
