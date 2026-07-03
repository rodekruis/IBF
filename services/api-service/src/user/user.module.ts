import { Module } from '@nestjs/common';

import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { UserController } from '@api-service/src/user/user.controller';
import { UserRepository } from '@api-service/src/user/user.repository';
import { UserService } from '@api-service/src/user/user.service';

@Module({
  imports: [PrismaModule],
  providers: [UserService, UserRepository],
  controllers: [UserController],
  exports: [UserService, UserRepository],
})
export class UserModule {}
