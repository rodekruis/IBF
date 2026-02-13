import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';

import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

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
    await this.prisma.user.create({
      data: {
        username: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN,
        password: crypto
          .createHmac('sha256', env.USERCONFIG_API_SERVICE_PASSWORD_ADMIN)
          .digest('hex'),
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
