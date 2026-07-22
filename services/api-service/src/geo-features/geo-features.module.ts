import { Module } from '@nestjs/common';

import { GeoFeaturesController } from '@api-service/src/geo-features/geo-features.controller';
import { GeoFeaturesRepository } from '@api-service/src/geo-features/geo-features.repository';
import { GeoFeaturesService } from '@api-service/src/geo-features/geo-features.service';
import { LayersModule } from '@api-service/src/layers/layers.module';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, LayersModule],
  providers: [GeoFeaturesService, GeoFeaturesRepository],
  controllers: [GeoFeaturesController],
  exports: [GeoFeaturesService],
})
export class GeoFeaturesModule {}
