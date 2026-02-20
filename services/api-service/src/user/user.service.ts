import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { User } from '@prisma/client';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

import { IS_DEVELOPMENT } from '@api-service/src/config';
import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { CookieNames } from '@api-service/src/shared/enum/cookie.enums';
import {
  INTERFACE_NAME_HEADER,
  InterfaceNames,
} from '@api-service/src/shared/enum/interface-names.enum';
import { CookieSettingsDto } from '@api-service/src/user/dto/cookie-settings.dto';
import { LoginResponseDto } from '@api-service/src/user/dto/login-response.dto';
import { LoginUserDto } from '@api-service/src/user/dto/login-user.dto';
import { UserData, UserRO } from '@api-service/src/user/user.interface';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';
const tokenExpirationDays = 14;

@Injectable({ scope: Scope.REQUEST })
export class UserService {
  public constructor(
    @Inject(REQUEST) private readonly request: Request,
    private prisma: PrismaService,
  ) {}

  public async login(loginUserDto: LoginUserDto): Promise<LoginResponseDto> {
    const userEntity = await this.matchPassword(loginUserDto);

    if (!userEntity) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = this.generateJWT(userEntity);
    const user = await this.buildUserRO(userEntity);

    const cookieSettings = this.buildCookieByRequest(token);
    userEntity.lastLogin = new Date();
    await this.prisma.user.update({
      where: { id: userEntity.id },
      data: { lastLogin: userEntity.lastLogin },
    });
    return { userRo: user, cookieSettings, token };
  }

  public async create(
    username: string,
    displayName: string | null,
    password: string,
  ): Promise<User> {
    username = username.toLowerCase();
    // check uniqueness of email
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (user) {
      const errors = { username: `Username: '${username}' must be unique.` };
      throw new HttpException(
        { message: 'Input data validation failed', errors },
        HttpStatus.BAD_REQUEST,
      );
    }

    // create new user
    const { hash, salt } = hashPassword(password);
    const newUser = await this.prisma.user.create({
      data: {
        username,
        password: hash,
        salt,
        displayName: displayName || username.split('@')[0],
      },
    });

    return newUser;
  }

  public async findById(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      const errors = { User: ' not found' };
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return user;
  }

  public async findByUsernameOrThrow(username: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      const errors = { User: ' not found' };
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return user;
  }

  public async getUserRoByUsernameOrThrow(username: string): Promise<UserRO> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      const errors = `User not found'`;
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return await this.buildUserRO(user);
  }

  public generateJWT(user: User): string {
    const today = new Date();
    const exp = new Date(today);
    exp.setDate(today.getDate() + tokenExpirationDays);

    const result = jwt.sign(
      {
        id: user.id,
        username: user.username,
        exp: exp.getTime() / 1000,
        admin: user.admin,
      },
      env.SECRETS_API_SERVICE_SECRET,
    );

    return result;
  }

  public getInterfaceKeyByHeader(): string {
    const originInterface = this.request.headers[INTERFACE_NAME_HEADER];
    switch (originInterface) {
      case InterfaceNames.portal:
        return CookieNames.portal;
      default:
        return CookieNames.general;
    }
  }

  public getCookieSecuritySettings(): {
    sameSite: 'Strict' | 'Lax' | 'None';
    secure: boolean;
    httpOnly: boolean;
  } {
    return {
      sameSite: IS_DEVELOPMENT ? 'Lax' : 'None',
      secure: !IS_DEVELOPMENT,
      httpOnly: true,
    };
  }

  public async buildUserRO(user: User): Promise<UserRO> {
    const userData: UserData = {
      id: user.id,
      username: user.username ?? undefined,
      isAdmin: user.admin,
      displayName: user.displayName,
    };

    return { user: userData };
  }

  private buildCookieByRequest(token: string): CookieSettingsDto {
    const tokenKey: string = this.getInterfaceKeyByHeader();
    const { sameSite, secure, httpOnly } = this.getCookieSecuritySettings();

    return {
      tokenKey,
      tokenValue: token,
      sameSite,
      secure,
      httpOnly,
      expires: new Date(Date.now() + tokenExpirationDays * 24 * 3600000),
    };
  }

  public async matchPassword(loginUserDto: LoginUserDto): Promise<User | null> {
    const username = loginUserDto.username.toLowerCase();
    const saltCheck = await this.prisma.user.findUnique({
      where: { username },
      select: { salt: true },
    });

    if (!saltCheck) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const userSalt = saltCheck.salt;

    const findOneOptions = {
      username,
      password: userSalt
        ? crypto
            .pbkdf2Sync(loginUserDto.password, userSalt, 1, 32, 'sha256')
            .toString('hex')
        : crypto.createHmac('sha256', loginUserDto.password).digest('hex'),
    };
    const userEntity = await this.prisma.user.findFirst({
      where: findOneOptions,
    });

    return userEntity;
  }

  public async getUsers() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        admin: true,
        displayName: true,
      },
    });
  }
}
