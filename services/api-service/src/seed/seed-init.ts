import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AdminAreasService } from '@api-service/src/admin-areas/admin-areas.service';
import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { CountriesService } from '@api-service/src/countries/countries.service';
import { env } from '@api-service/src/env';
import { GeoFeatureCreateDto } from '@api-service/src/geo-features/dto/geo-feature-create.dto';
import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { GeoFeaturesService } from '@api-service/src/geo-features/geo-features.service';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { RastersService } from '@api-service/src/rasters/rasters.service';
import {
  FLOOD_CLASSIFICATION_BY_COUNTRY,
  FLOOD_LEAD_TIME_SPECTRUM,
  SEED_DROUGHT_ALERT_CONFIGS,
  SEED_TROPICAL_CYCLONE_ALERT_CONFIGS,
  SeedAlertConfig,
} from '@api-service/src/seed/seed-data/seed-alert-configs.const';
import {
  SEED_COUNTRIES,
  SeedCountry,
} from '@api-service/src/seed/seed-data/seed-countries.const';
import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { HazardType, LayerName } from '@api-service/src/shared-enums';
import { hashPassword } from '@api-service/src/utils/hash-password.helper';
import { processPopulationRaster } from '@api-service/src/utils/raster-colorization.helper';

interface GeoJsonFeature {
  readonly type: string;
  readonly properties: Record<string, string | null>;
  readonly geometry: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  readonly type: string;
  readonly features: GeoJsonFeature[];
}

interface StationThresholdEntry {
  readonly station_code: string;
  readonly station_name: string;
  readonly lat: number;
  readonly lon: number;
  readonly pcodes: Record<string, string[]>;
  readonly thresholds: { return_period: number; threshold_value: number }[];
}

const SEED_REPO_RAW_BASE_URL =
  'https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main';

const ADMIN_AREAS_PATH = '/admin-areas/processed';
const STATION_THRESHOLDS_PATH = '/pipelines';

function getAdminAreaFileUrl(
  countryCodeIso3: string,
  adminLevel: number,
): string {
  return `${SEED_REPO_RAW_BASE_URL}${ADMIN_AREAS_PATH}/${countryCodeIso3}_adm${adminLevel}.json`;
}

function getStationThresholdsFileUrl(countryCodeIso3: string): string {
  return `${SEED_REPO_RAW_BASE_URL}${STATION_THRESHOLDS_PATH}/${countryCodeIso3}_station_thresholds.json`;
}

@Injectable()
export class SeedInit {
  private readonly logger = new Logger(SeedInit.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly countriesService: CountriesService,
    private readonly adminAreasService: AdminAreasService,
    private readonly alertConfigsService: AlertConfigsService,
    private readonly geoFeaturesService: GeoFeaturesService,
    private readonly rastersService: RastersService,
  ) {}

  public async run({
    countryCodes,
    skipStaticRasters = false,
  }: {
    countryCodes?: string[];
    skipStaticRasters?: boolean;
  }): Promise<void> {
    await this.truncateAll();
    await this.createAdminUser();

    const countries = countryCodes
      ? SEED_COUNTRIES.filter((c) => countryCodes.includes(c.countryCodeIso3))
      : SEED_COUNTRIES;

    await this.seedCountries(countries);
    await this.seedAdminAreas(countries);
    await this.seedAlertConfigs(countries);
    await this.seedGeoFeatures(countries);
    if (!skipStaticRasters) {
      await this.seedStaticRasters(countries);
    }
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
    await this.countriesService.createCountries(
      countries.map(({ countryCodeIso3, countryCodeIso2, countryName }) => ({
        countryCodeIso3,
        countryCodeIso2,
        countryName,
      })),
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
    this.logger.log(`Download ${filename}...`);

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
      .filter(
        (area): area is NonNullable<typeof area> => area !== undefined,
      ) satisfies AdminAreaCreateDto[];

    if (adminAreas.length === 0) {
      return;
    }

    await this.adminAreasService.createAdminAreas(adminAreas);

    this.logger.log(`Seeded ${adminAreas.length} admin areas from ${filename}`);
  }

  private parseAdminAreaFeature(
    feature: GeoJsonFeature,
    file: { countryCodeIso3: string; adminLevel: number },
  ): AdminAreaCreateDto | undefined {
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

    const attributes: Record<string, unknown> = {
      POPULATION: typeof props.POPULATION === 'number' ? props.POPULATION : 0,
    };

    return {
      placeCode,
      adminLevel: file.adminLevel,
      nameEn,
      countryCodeIso3: file.countryCodeIso3,
      placeCodeLevel1: props.ADM1_PCODE ?? null,
      placeCodeLevel2: props.ADM2_PCODE ?? null,
      placeCodeLevel3: props.ADM3_PCODE ?? null,
      placeCodeLevel4: props.ADM4_PCODE ?? null,
      attributes,
      geometry: this.normalizeToMultiPolygon(feature.geometry),
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

  private async seedAlertConfigs(countries: SeedCountry[]): Promise<void> {
    const countryCodesForHazard = (hazardType: HazardType): string[] =>
      countries
        .filter((c) => c.hazardTypes.includes(hazardType))
        .map((c) => c.countryCodeIso3);

    // Floods: spatial extents are GloFAS stations, fetched from the seed-data repo
    const floodConfigs = (
      await Promise.all(
        countries
          .filter((c) => c.hazardTypes.includes(HazardType.floods))
          .map((country) => this.loadFloodAlertConfigsFromSeedRepo(country)),
      )
    ).flat();

    // Drought: spatial extents are climate regions defined in code (seed-alert-configs.const.ts)
    // TODO: move drought alert configs to an external source (seed-data repo or similar)
    const droughtConfigs = SEED_DROUGHT_ALERT_CONFIGS.filter((c) =>
      countryCodesForHazard(HazardType.drought).includes(c.countryCodeIso3),
    );

    // Tropical cyclone: one generic spatial extent per country, defined in code
    const tropicalCycloneConfigs = SEED_TROPICAL_CYCLONE_ALERT_CONFIGS.filter(
      (c) =>
        countryCodesForHazard(HazardType.tropicalCyclone).includes(
          c.countryCodeIso3,
        ),
    );

    const allConfigs: SeedAlertConfig[] = [
      ...floodConfigs,
      ...droughtConfigs,
      ...tropicalCycloneConfigs,
    ];

    await this.alertConfigsService.createAlertConfigs(
      allConfigs.map(
        (config): AlertConfigCreateDto => ({
          countryCodeIso3: config.countryCodeIso3,
          hazardType: config.hazardType as HazardType,
          spatialExtentName: config.spatialExtentName,
          spatialExtentPlaceCodes: config.spatialExtentPlaceCodes,
          temporalExtents: config.temporalExtents,
          severityClassLevels: config.severityClassLevels,
          probabilityClassLevels: config.probabilityClassLevels,
          triggerAlertClass: config.triggerAlertClass,
          triggerLeadTimeDuration: config.triggerLeadTimeDuration,
        }),
      ),
    );
    this.logger.log(`Seeded ${allConfigs.length} alert configs`);
  }

  private async loadFloodAlertConfigsFromSeedRepo(
    country: SeedCountry,
  ): Promise<SeedAlertConfig[]> {
    // Each GloFAS station becomes one alert-config spatial extent.
    // The station_thresholds.json maps stations to downstream admin-area place codes.
    const url = getStationThresholdsFileUrl(country.countryCodeIso3);
    this.logger.log(
      `Download GloFAS station thresholds for ${country.countryCodeIso3}...`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.warn(
        `No station thresholds for ${country.countryCodeIso3}: ${response.status}`,
      );
      return [];
    }

    const entries = (await response.json()) as StationThresholdEntry[];
    const targetAdminLevel = String(country.deepestAdminLevel);

    const stationMap = new Map<string, string[]>();
    for (const entry of entries) {
      if (!stationMap.has(entry.station_code)) {
        const placeCodes = entry.pcodes[targetAdminLevel] ?? [];
        stationMap.set(entry.station_code, placeCodes);
      }
    }

    const classificationConfig =
      FLOOD_CLASSIFICATION_BY_COUNTRY[country.countryCodeIso3];
    if (!classificationConfig) {
      this.logger.warn(
        `No flood classification config for ${country.countryCodeIso3}, skipping`,
      );
      return [];
    }

    const configs: SeedAlertConfig[] = [];
    for (const [stationCode, placeCodes] of stationMap) {
      if (placeCodes.length === 0) {
        continue;
      }
      configs.push({
        countryCodeIso3: country.countryCodeIso3,
        hazardType: HazardType.floods,
        spatialExtentName: stationCode,
        spatialExtentPlaceCodes: placeCodes,
        temporalExtents: [{ 'lead-time-spectrum': FLOOD_LEAD_TIME_SPECTRUM }],
        severityClassLevels: classificationConfig.severityClassLevels,
        probabilityClassLevels: classificationConfig.probabilityClassLevels,
        triggerAlertClass: classificationConfig.triggerAlertClass,
        triggerLeadTimeDuration: classificationConfig.triggerLeadTimeDuration,
      });
    }

    this.logger.log(
      `Loaded ${configs.length} flood alert configs for ${country.countryCodeIso3}`,
    );
    return configs;
  }

  private async seedGeoFeatures(countries: SeedCountry[]): Promise<void> {
    const floodCountries = countries.filter((c) =>
      c.hazardTypes.includes(HazardType.floods),
    );

    for (const country of floodCountries) {
      await this.seedGloFasStations(country.countryCodeIso3);
    }
  }

  private async seedGloFasStations(countryCodeIso3: string): Promise<void> {
    const url = getStationThresholdsFileUrl(countryCodeIso3);
    const response = await fetch(url);
    if (!response.ok) {
      this.logger.warn(
        `No station thresholds for ${countryCodeIso3}: ${response.status} — skipping geo-feature seeding`,
      );
      return;
    }

    const entries = (await response.json()) as StationThresholdEntry[];
    const seenStations = new Map<
      string,
      {
        name: string;
        lat: number;
        lon: number;
        thresholds: { return_period: number; threshold_value: number }[];
      }
    >();
    for (const entry of entries) {
      if (!seenStations.has(entry.station_code)) {
        seenStations.set(entry.station_code, {
          name: entry.station_name,
          lat: entry.lat,
          lon: entry.lon,
          thresholds: entry.thresholds,
        });
      }
    }

    const geoFeatures: GeoFeatureCreateDto[] = [...seenStations.entries()].map(
      ([stationCode, station]) => ({
        countryCodeIso3,
        featureType: GeoFeatureType.point,
        layer: LayerName.glofasStations,
        referenceId: stationCode,
        geometry: {
          type: 'Point',
          coordinates: [station.lon, station.lat],
        },
        attributes: {
          name: station.name,
          thresholds: station.thresholds,
        },
      }),
    );

    if (geoFeatures.length === 0) {
      return;
    }

    await this.geoFeaturesService.createGeoFeatures(geoFeatures);

    this.logger.log(
      `Seeded ${geoFeatures.length} GloFAS station geo-features for ${countryCodeIso3}`,
    );
  }

  private async seedStaticRasters(countries: SeedCountry[]): Promise<void> {
    for (const country of countries) {
      await this.seedPopulationRaster(country.countryCodeIso3);
    }
  }

  private async seedPopulationRaster(countryCodeIso3: string): Promise<void> {
    const dataPngUrl = `${SEED_REPO_RAW_BASE_URL}/raster-data/population/data-png/${countryCodeIso3}_population.png`;
    const metadataUrl = `${SEED_REPO_RAW_BASE_URL}/raster-data/population/data-png/${countryCodeIso3}_population_metadata.json`;

    this.logger.log(`Download population raster for ${countryCodeIso3}...`);

    const [dataPngResponse, metadataResponse] = await Promise.all([
      fetch(dataPngUrl),
      fetch(metadataUrl),
    ]);

    if (!dataPngResponse.ok) {
      this.logger.warn(
        `No population data PNG for ${countryCodeIso3}: ${dataPngResponse.status} — skipping`,
      );
      return;
    }

    if (!metadataResponse.ok) {
      this.logger.warn(
        `No population metadata for ${countryCodeIso3}: ${metadataResponse.status} — skipping`,
      );
      return;
    }

    const dataPngBuffer = Buffer.from(await dataPngResponse.arrayBuffer());
    const metadata = (await metadataResponse.json()) as {
      transform: number[];
      crs: EPSG;
    };

    const { colouredBase64, metadata: rasterMetadata } =
      processPopulationRaster(dataPngBuffer, metadata);

    await this.rastersService.upsertStaticRaster({
      countryCodeIso3,
      layer: LayerName.population,
      valueData: dataPngBuffer.toString('base64'),
      valueColoured: colouredBase64,
      metadata: rasterMetadata,
    });

    this.logger.log(`Seeded population raster for ${countryCodeIso3}`);
  }

  public async truncateAll(): Promise<void> {
    const tables = await this.prisma.$queryRaw<{ tablename: string }[]>(
      Prisma.sql`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'api-service'
          AND tablename != '_prisma_migrations'
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
