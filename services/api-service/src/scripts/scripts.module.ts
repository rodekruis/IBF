import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { ScriptsController } from '@api-service/src/scripts/scripts.controller';
import { ScriptsService } from '@api-service/src/scripts/scripts.service';
import { SeedInit } from '@api-service/src/scripts/seed-init';
import { CustomHttpService } from '@api-service/src/shared/services/custom-http.service';

@Module({
  imports: [HttpModule],
  providers: [ScriptsService, SeedInit, CustomHttpService, PrismaService],
  controllers: [ScriptsController],
})
export class ScriptsModule {}
