import { Injectable } from '@nestjs/common';

import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';

interface CreateUserParams {
  readonly username: string;
  readonly password: string;
  readonly displayName?: string | null;
  readonly admin?: boolean;
}

@Injectable()
export class UserRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createUser(params: CreateUserParams): Promise<void> {
    const { hash, salt } = hashPassword(params.password);
    await this.prisma.user.create({
      data: {
        username: params.username,
        password: hash,
        salt,
        admin: params.admin ?? false,
        displayName: params.displayName ?? params.username.split('@')[0],
      },
    });
  }
}
