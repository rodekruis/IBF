import { Injectable } from '@nestjs/common';

import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';

@Injectable()
export class SeedInit {
  public constructor(private prisma: PrismaService) {}

  public async run({
    isApiTests = false,
  }: {
    isApiTests?: boolean;
  } = {}): Promise<void> {
    if (isApiTests) {
      await this.truncateAll();
    } else {
      await this.truncateAll();
    }
    await this.createAdminUser();
  }

  private async createAdminUser(): Promise<void> {
    const { hash, salt } = hashPassword(
      env.USERCONFIG_API_SERVICE_PASSWORD_ADMIN,
    );
    await this.prisma.user.create({
      data: {
        username: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN,
        password: hash,
        salt,
        admin: true,
        displayName: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN.split('@')[0],
      },
    });
  }

  public async truncateAll(): Promise<void> {
    // Delete all users (add more models as needed)
    await this.prisma.user.deleteMany();
  }
}
