import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Layer } from '@api-service/src/alerts/enum/shared-enums';
import { GeoFeatureResponseDto } from '@api-service/src/geo-features/dto/geo-feature-response.dto';
import { GeoFeatureType } from '@api-service/src/geo-features/enum/geo-feature-type.enum';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

type GeoFeatureRow = Prisma.GeoFeatureGetPayload<null>;

@Injectable()
export class GeoFeaturesRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: GeoFeatureRow): GeoFeatureResponseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      countryCodeIso3: row.countryCodeIso3,
      featureType: row.featureType as GeoFeatureType,
      layer: row.layer as Layer,
      referenceId: row.referenceId,
      geometry: row.geometry as Record<string, unknown>,
      attributes: row.attributes as Record<string, unknown>,
    };
  }

  public async getGeoFeatures({
    countryCodeIso3,
    layer,
  }: {
    countryCodeIso3?: string;
    layer?: string;
  }): Promise<GeoFeatureResponseDto[]> {
    const rows = await this.prisma.geoFeature.findMany({
      where: {
        ...(countryCodeIso3 !== undefined && { countryCodeIso3 }),
        ...(layer !== undefined && { layer }),
      },
      orderBy: { referenceId: 'asc' },
    });
    return rows.map((row) => this.toResponseDto(row));
  }
}
