import { Global, Module } from '@nestjs/common';

import { PrismaService } from '@api-service/src/prisma/prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
