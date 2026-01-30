import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

import { ORMConfig } from '@API-service/src/ormconfig';
import { ScriptsController } from '@API-service/src/scripts/scripts.controller';
import { SeedInit } from '@API-service/src/scripts/seed-init';
import { ScriptsService } from '@API-service/src/scripts/services/scripts.service';
import { CustomHttpService } from '@API-service/src/shared/services/custom-http.service';

@Module({
  imports: [
    TypeOrmModule.forRoot(ORMConfig as TypeOrmModuleOptions),
    HttpModule,
  ],
  providers: [ScriptsService, SeedInit, CustomHttpService],
  controllers: [ScriptsController],
})
export class ScriptsModule {}
