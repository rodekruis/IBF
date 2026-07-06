import { Injectable } from '@nestjs/common';
import type { Feature, FeatureCollection } from 'geojson';

import { AdminAreasRepository } from '@api-service/src/admin-areas/admin-areas.repository';
import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';

@Injectable()
export class AdminAreasService {
  public constructor(
    private readonly adminAreasRepository: AdminAreasRepository,
  ) {}

  public async getAdminAreas(
    query: Record<string, string>,
  ): Promise<FeatureCollection> {
    return this.adminAreasRepository.getAdminAreas(query);
  }

  public async createAdminAreas(dtos: AdminAreaCreateDto[]): Promise<void> {
    return this.adminAreasRepository.createAdminAreas(dtos);
  }

  public async updateAdminAreaOrThrow(
    placeCode: string,
    adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<Feature> {
    return this.adminAreasRepository.updateAdminAreaOrThrow(
      placeCode,
      adminAreaUpdateDto,
    );
  }

  public async deleteAdminAreaOrThrow(placeCode: string): Promise<void> {
    return this.adminAreasRepository.deleteAdminAreaOrThrow(placeCode);
  }
}
