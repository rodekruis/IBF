import { Module } from '@nestjs/common';

import { LayersController } from '@api-service/src/layers/layers.controller';
import { LayersRepository } from '@api-service/src/layers/layers.repository';
import { LayersService } from '@api-service/src/layers/layers.service';
import { PrismaModule } from '@api-service/src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LayersController],
  providers: [LayersService, LayersRepository],
  exports: [LayersService],
})
export class LayersModule {}
