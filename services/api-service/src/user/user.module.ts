import { Module } from '@nestjs/common';

import { PrismaModule } from '@api-service/src/prisma/prisma.module';
import { UserController } from '@api-service/src/user/user.controller';
import { UserService } from '@api-service/src/user/user.service';

@Module({
  imports: [PrismaModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
