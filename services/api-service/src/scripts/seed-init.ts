import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { env } from '@api-service/src/env';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { getAdminAreaFileUrl } from '@api-service/src/scripts/seed-data/seed-admin-areas.const';
import { SEED_ALERT_CONFIGS } from '@api-service/src/scripts/seed-data/seed-alert-configs.const';
import {
  SEED_COUNTRIES,
  SeedCountry,
} from '@api-service/src/scripts/seed-data/seed-countries.const';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';

interface GeoJsonFeature {
  readonly type: string;
  readonly properties: Record<string, string | null>;
  readonly geometry: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  readonly type: string;
  readonly features: GeoJsonFeature[];
}

@Injectable()
export class SeedInit {
  private readonly logger = new Logger(SeedInit.name);

  public constructor(private prisma: PrismaService) {}

  public async run({
    countryCodes,
  }: {
    countryCodes?: string[];
  }): Promise<void> {
    await this.truncateAll();
    await this.createAdminUser();

    const countries = countryCodes
      ? SEED_COUNTRIES.filter((c) => countryCodes.includes(c.countryCodeIso3))
      : SEED_COUNTRIES;

    await this.seedCountries(countries);
    await this.seedAdminAreas(countries);
    await this.seedAlertConfigs(countryCodes);
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

  private async seedCountries(countries: SeedCountry[]): Promise<void> {
    await this.prisma.$transaction(
      countries.map(({ countryCodeIso3, countryCodeIso2, countryName }) =>
        this.prisma.country.create({
          data: { countryCodeIso3, countryCodeIso2, countryName },
        }),
      ),
    );
  }

  private async seedAdminAreas(countries: SeedCountry[]): Promise<void> {
    for (const country of countries) {
      for (
        let adminLevel = 0;
        adminLevel <= country.deepestAdminLevel;
        adminLevel++
      ) {
        await this.seedAdminAreaFile(country.countryCodeIso3, adminLevel);
      }
    }
  }

  private async seedAdminAreaFile(
    countryCodeIso3: string,
    adminLevel: number,
  ): Promise<void> {
    const filename = `${countryCodeIso3}_adm${adminLevel}.json`;
    const url = getAdminAreaFileUrl(countryCodeIso3, adminLevel);
    this.logger.log(`Downloading ${filename}...`);

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.warn(
        `Failed to download ${filename}: ${response.status} ${response.statusText}`,
      );
      return;
    }

    const geojson = (await response.json()) as GeoJsonFeatureCollection;
    if (geojson.type !== 'FeatureCollection' || !geojson.features) {
      this.logger.warn(`${filename} is not a valid FeatureCollection`);
      return;
    }

    const adminAreas = geojson.features
      .map((feature) =>
        this.parseAdminAreaFeature(feature, {
          countryCodeIso3,
          adminLevel,
        }),
      )
      .filter((area): area is NonNullable<typeof area> => area !== undefined);

    if (adminAreas.length === 0) {
      return;
    }

    const BATCH_SIZE = 100;
    for (let i = 0; i < adminAreas.length; i += BATCH_SIZE) {
      const batch = adminAreas.slice(i, i + BATCH_SIZE);
      await this.prisma.$transaction(
        batch.map((area) => this.prisma.adminArea.create({ data: area })),
      );
    }

    this.logger.log(`Seeded ${adminAreas.length} admin areas from ${filename}`);
  }

  private parseAdminAreaFeature(
    feature: GeoJsonFeature,
    file: { countryCodeIso3: string; adminLevel: number },
  ):
    | {
        placeCode: string;
        adminLevel: number;
        nameEn: string;
        countryCodeIso3: string;
        parentPlaceCode: string | null;
        geometry: Prisma.InputJsonValue;
      }
    | undefined {
    const props = feature.properties;

    const placeCode =
      props[`ADM${file.adminLevel}_PCODE`] ??
      props.ADM4_PCODE ??
      props.ADM3_PCODE ??
      props.ADM2_PCODE ??
      props.ADM1_PCODE ??
      props.ADM0_PCODE;

    const nameEn =
      props[`ADM${file.adminLevel}_EN`] ??
      props.ADM4_EN ??
      props.ADM3_EN ??
      props.ADM2_EN ??
      props.ADM1_EN ??
      props.ADM0_EN;

    if (!placeCode || !nameEn) {
      this.logger.warn(
        `Skipping feature with missing placeCode or name in ${file.countryCodeIso3} adm${file.adminLevel}`,
      );
      return undefined;
    }

    // Parent place code is one level up
    const parentPlaceCode =
      file.adminLevel > 0
        ? (props[`ADM${file.adminLevel - 1}_PCODE`] ?? null)
        : null;

    const geometry = this.normalizeToMultiPolygon(feature.geometry);

    return {
      placeCode,
      adminLevel: file.adminLevel,
      nameEn,
      countryCodeIso3: file.countryCodeIso3,
      parentPlaceCode,
      geometry: geometry as Prisma.InputJsonValue,
    };
  }

  private normalizeToMultiPolygon(
    geometry: Record<string, unknown>,
  ): Record<string, unknown> {
    if (geometry.type === 'Polygon') {
      return {
        type: 'MultiPolygon',
        coordinates: [geometry.coordinates],
      };
    }
    return geometry;
  }

  private async seedAlertConfigs(countryCodes?: string[]): Promise<void> {
    const alertConfigs = countryCodes
      ? SEED_ALERT_CONFIGS.filter((c) =>
          countryCodes.includes(c.countryCodeIso3),
        )
      : SEED_ALERT_CONFIGS;

    await this.prisma.$transaction(
      alertConfigs.map((alertConfig) =>
        this.prisma.alertConfig.create({ data: alertConfig }),
      ),
    );
    this.logger.log(`Seeded ${alertConfigs.length} alert configs`);
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
