import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { THROTTLING_LIMIT_HIGH } from '@API-service/src/config';
import { AuthenticatedUser } from '@API-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@API-service/src/guards/authenticated-user.guard';
import { CookieNames } from '@API-service/src/shared/enum/cookie.enums';
import { LoginUserDto } from '@API-service/src/user/dto/login-user.dto';
import { UserEntity } from '@API-service/src/user/user.entity';
import { UserRO } from '@API-service/src/user/user.interface';
import { UserService } from '@API-service/src/user/user.service';

@ApiTags('users')
@UseGuards(AuthenticatedUserGuard)
@Controller()
export class UserController {
  public constructor(private readonly userService: UserService) {}

  @AuthenticatedUser()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all users',
    type: [UserEntity],
  })
  @Get('users')
  public async getUsers() {
    return await this.userService.getUsers();
  }

  @Throttle(THROTTLING_LIMIT_HIGH)
  @ApiOperation({ summary: '[EXTERNALLY USED] Log in existing user' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Logged in successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Wrong username and/or password',
  })
  @Post('users/login')
  public async login(
    @Body() loginUserDto: LoginUserDto,
    @Res() res,
  ): Promise<UserRO> {
    try {
      const loginResponse = await this.userService.login(loginUserDto);

      res.cookie(
        loginResponse.cookieSettings.tokenKey,
        loginResponse.cookieSettings.tokenValue,
        {
          sameSite: loginResponse.cookieSettings.sameSite,
          secure: loginResponse.cookieSettings.secure,
          expires: loginResponse.cookieSettings.expires,
          httpOnly: loginResponse.cookieSettings.httpOnly,
        },
      );
      return res.send({
        username: loginResponse.userRo.user.username,
        [CookieNames.general]: loginResponse.token,
        expires: loginResponse.cookieSettings.expires,
        isAdmin: loginResponse.userRo.user.isAdmin,
      });
    } catch (error) {
      throw error;
    }
  }

  @AuthenticatedUser()
  @ApiOperation({ summary: 'Log out existing user' })
  @Post('users/logout')
  public async logout(@Res() res): Promise<UserRO> {
    try {
      const key = this.userService.getInterfaceKeyByHeader();
      const { sameSite, secure, httpOnly } =
        this.userService.getCookieSecuritySettings();

      res.cookie(key, '', {
        sameSite,
        secure,
        httpOnly,
        expires: new Date(Date.now() - 1),
      });
      return res.send();
    } catch (error) {
      throw error;
    }
  }

  @AuthenticatedUser()
  @ApiOperation({ summary: 'Get current user' })
  @Get('users/current')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User returned',
  })
  public async findMe(@Req() req): Promise<UserRO> {
    if (!req.user || !req.user.username) {
      const errors = `No user detectable from cookie or no cookie present'`;
      throw new HttpException({ errors }, HttpStatus.UNAUTHORIZED);
    }

    return await this.userService.getUserRoByUsernameOrThrow(req.user.username);
  }
}
