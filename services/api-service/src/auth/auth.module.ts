import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { CookieJwtStrategy } from '@api-service/src/strategies/cookie-jwt.strategy';
import { UserModule } from '@api-service/src/user/user.module';

@Module({
  imports: [
    UserModule,
    PassportModule.register({ defaultStrategy: 'cookie-jwt' }),
  ],
  providers: [CookieJwtStrategy],
})
export class AuthModule {}
