import { Module } from '@nestjs/common';

import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { UserController } from '@api-service/src/user/user.controller';
import { UserService } from '@api-service/src/user/user.service';

@Module({
  imports: [],
  providers: [UserService, PrismaService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
