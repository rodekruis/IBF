import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { DataSource } from 'typeorm';

import { env } from '@api-service/src/env';
import { UserEntity } from '@api-service/src/user/user.entity';

@Injectable()
export class SeedInit {
  public constructor(private dataSource: DataSource) {}

  public async run({
    isApiTests = false,
  }: {
    isApiTests?: boolean;
  }): Promise<void> {
    if (isApiTests) {
      // Only truncate tables when running the API tests, since API Tests are run asynchronously, it may run into a situation where the migrations are still running and a table does not exist yet
      await this.truncateAll();
    } else {
      // Drop all tables in all other cases (i.e. when not running API Tests), since that creates a clean slate after switching branches.
      await this.dropAll();
      await this.runAllMigrations();
      // Some migration scripts contain data migrations (i.e. add data), so delete all data before seeding as well.
      await this.truncateAll();
    }
    await this.createAdminUser();
  }

  private async createAdminUser(): Promise<void> {
    const userRepository = this.dataSource.getRepository(UserEntity);
    await userRepository.save({
      username: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN,
      password: crypto
        .createHmac('sha256', env.USERCONFIG_API_SERVICE_PASSWORD_ADMIN)
        .digest('hex'),
      admin: true,
      displayName: env.USERCONFIG_API_SERVICE_EMAIL_ADMIN.split('@')[0],
    });
  }

  public async dropAll(): Promise<void> {
    const dropTableQueries = await this.dataSource.manager
      .query(`select 'drop table if exists "api-service"."' || tablename || '" cascade;'
        from pg_tables
        where schemaname = 'api-service'
        and tablename not in ('custom_migration_table');`);
    for (const q of dropTableQueries) {
      for (const key in q) {
        await this.dataSource.manager.query(q[key]);
      }
    }
  }

  public async truncateAll(): Promise<void> {
    const tablesToTruncate = await this.dataSource.manager.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'api-service'
      AND tablename NOT IN ('custom_migration_table');
  `);

    for (const table of tablesToTruncate) {
      const tableName = table.tablename;
      try {
        await this.dataSource.manager.query(`
        TRUNCATE TABLE "api-service"."${tableName}" CASCADE;
      `);

        const sequenceName = `${tableName}_id_seq`;
        const sequenceExists = await this.sequenceExists(sequenceName);

        if (sequenceExists) {
          await this.dataSource.manager.query(`
          ALTER SEQUENCE "api-service"."${sequenceName}" RESTART WITH 1;
        `);
        }
      } catch (error) {
        console.error(`Error truncating table "${tableName}":`, error);
      }
    }
  }

  private async sequenceExists(sequenceName: string): Promise<boolean> {
    const result = await this.dataSource.manager.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_sequences
      WHERE schemaname = 'api-service'
        AND sequencename = '${sequenceName}'
    );
  `);

    return result[0].exists;
  }

  private async runAllMigrations(): Promise<void> {
    await this.dataSource.query(
      'TRUNCATE TABLE "api-service"."custom_migration_table"',
    );
    await this.dataSource.runMigrations({
      transaction: 'all',
    });
  }
}
