import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

import { CookieSettingsDto } from '@api-service/src/user/dto/cookie-settings.dto';
import { UserRO } from '@api-service/src/user/user.interface';

export class LoginResponseDto {
  @ApiProperty({ example: '' })
  @IsNotEmpty()
  public readonly userRo: UserRO;

  @ApiProperty({ example: '' })
  @IsNotEmpty()
  public readonly cookieSettings: CookieSettingsDto;

  public readonly token: string;
}
