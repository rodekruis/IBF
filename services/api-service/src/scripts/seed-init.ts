import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';

@Injectable()
export class SeedInit {
  public constructor(private prisma: PrismaService) {}

  public async run(): Promise<void> {
    await this.truncateAll();
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
    const tables = await this.prisma.$queryRaw<{ tablename: string }[]>(
      Prisma.sql`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'api-service'
      `,
    );

    if (tables.length === 0) {
      return;
    }

    const quotedTableNames = tables
      .map(
        ({ tablename }) => `"api-service"."${tablename.replaceAll('"', '""')}"`,
      )
      .join(', ');

    await this.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${quotedTableNames} RESTART IDENTITY CASCADE`,
    );
  }
}
