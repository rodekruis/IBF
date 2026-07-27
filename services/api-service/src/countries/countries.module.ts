import { Module } from '@nestjs/common';

import { CountriesController } from '@api-service/src/countries/countries.controller';
import { CountriesRepository } from '@api-service/src/countries/countries.repository';
import { CountriesService } from '@api-service/src/countries/countries.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CountriesService, CountriesRepository],
  controllers: [CountriesController],
  exports: [CountriesService],
})
export class CountriesModule {}
