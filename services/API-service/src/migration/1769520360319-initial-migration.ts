import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1769520360319 implements MigrationInterface {
  name = 'InitialMigration1769520360319';

  // NOTE: until this goes to production, keep regenerating this file instead of appending new migrations in separate files.

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "API-service"."user" ("id" SERIAL NOT NULL, "created" TIMESTAMP NOT NULL DEFAULT now(), "updated" TIMESTAMP NOT NULL DEFAULT now(), "username" character varying, "password" character varying NOT NULL, "admin" boolean NOT NULL DEFAULT false, "salt" character varying, "lastLogin" TIMESTAMP, "displayName" character varying NOT NULL, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ce4c93ba419b56bd82e533724" ON "API-service"."user" ("created") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "API-service"."user" ("username") `,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no down migrations
  }
}
