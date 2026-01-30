import { HttpStatus, Inject, Injectable, Scope } from '@nestjs/common';
import { HttpException } from '@nestjs/common/exceptions/http.exception';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { Equal, FindOptionsRelations, Repository } from 'typeorm';

import { IS_DEVELOPMENT } from '@API-service/src/config';
import { env } from '@API-service/src/env';
import { CookieNames } from '@API-service/src/shared/enum/cookie.enums';
import {
  INTERFACE_NAME_HEADER,
  InterfaceNames,
} from '@API-service/src/shared/enum/interface-names.enum';
import { CookieSettingsDto } from '@API-service/src/user/dto/cookie-settings.dto';
import { LoginResponseDto } from '@API-service/src/user/dto/login-response.dto';
import { LoginUserDto } from '@API-service/src/user/dto/login-user.dto';
import { UserEntity } from '@API-service/src/user/user.entity';
import { UserData, UserRO } from '@API-service/src/user/user.interface';
const tokenExpirationDays = 14;

@Injectable({ scope: Scope.REQUEST })
export class UserService {
  @InjectRepository(UserEntity)
  private readonly userRepository: Repository<UserEntity>;

  public constructor(@Inject(REQUEST) private readonly request: Request) {}

  public async login(loginUserDto: LoginUserDto): Promise<LoginResponseDto> {
    const userEntity = await this.matchPassword(loginUserDto);

    if (!userEntity) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = this.generateJWT(userEntity);
    const user = await this.buildUserRO(userEntity);

    const cookieSettings = this.buildCookieByRequest(token);
    userEntity.lastLogin = new Date();
    await this.userRepository.save(userEntity);
    return { userRo: user, cookieSettings, token };
  }

  public async create(
    username: string,
    displayName: string | null,
    password: string,
  ): Promise<UserEntity> {
    username = username.toLowerCase();
    // check uniqueness of email
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username });

    const user = await qb.getOne();

    if (user) {
      const errors = { username: `Username: '${username}' must be unique.` };
      throw new HttpException(
        { message: 'Input data validation failed', errors },
        HttpStatus.BAD_REQUEST,
      );
    }

    // create new user
    const newUser = new UserEntity();
    newUser.username = username;
    newUser.password = password;
    newUser.displayName = displayName || username.split('@')[0];
    return await this.userRepository.save(newUser);
  }

  public async findById(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: Equal(id) },
    });

    if (!user) {
      const errors = { User: ' not found' };
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return user;
  }

  public async findByUsernameOrThrow(
    username: string,
    relations?: FindOptionsRelations<UserEntity>,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { username: Equal(username) },
      relations,
    });

    if (!user) {
      const errors = { User: ' not found' };
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return user;
  }

  public async getUserRoByUsernameOrThrow(username: string): Promise<UserRO> {
    const user = await this.userRepository.findOne({
      where: { username: Equal(username) },
    });
    if (!user) {
      const errors = `User not found'`;
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }

    return await this.buildUserRO(user);
  }

  public generateJWT(user: UserEntity): string {
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

  public async buildUserRO(user: UserEntity): Promise<UserRO> {
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

  public async matchPassword(
    loginUserDto: LoginUserDto,
  ): Promise<UserEntity | null> {
    const username = loginUserDto.username.toLowerCase();
    const saltCheck = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.salt')
      .where({ username })
      .getOne();

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
    const userEntity = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('password')
      .where(findOneOptions)
      .getOne();

    return userEntity;
  }

  public async getUsers() {
    return await this.userRepository.find({
      select: {
        id: true,
        username: true,
        admin: true,
        displayName: true,
      },
    });
  }
}
