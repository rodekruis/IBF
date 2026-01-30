import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { CookieJwtStrategy } from '@API-service/src/strategies/cookie-jwt.strategy';
import { UserModule } from '@API-service/src/user/user.module';

@Module({
  imports: [
    UserModule,
    PassportModule.register({ defaultStrategy: 'cookie-jwt' }),
  ],
  providers: [CookieJwtStrategy],
})
export class AuthModule {}
