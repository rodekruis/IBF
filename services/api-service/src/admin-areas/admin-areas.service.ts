import { Injectable } from '@nestjs/common';

import { AdminAreasRepository } from '@api-service/src/admin-areas/admin-areas.repository';
import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaResponseDto } from '@api-service/src/admin-areas/dto/admin-area-response.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';

@Injectable()
export class AdminAreasService {
  public constructor(
    private readonly adminAreasRepository: AdminAreasRepository,
  ) {}

  public async getAdminAreas({
    countryCodeIso3,
    adminLevel,
  }: {
    countryCodeIso3: string;
    adminLevel?: number;
  }): Promise<AdminAreaResponseDto[]> {
    return this.adminAreasRepository.getAdminAreas({
      countryCodeIso3,
      adminLevel,
    });
  }

  public async getAdminAreaOrThrow(
    placeCode: string,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasRepository.getAdminAreaOrThrow(placeCode);
  }

  public async createAdminArea(
    adminAreaCreateDto: AdminAreaCreateDto,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasRepository.createAdminArea(adminAreaCreateDto);
  }

  public async updateAdminAreaOrThrow(
    placeCode: string,
    adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasRepository.updateAdminAreaOrThrow(
      placeCode,
      adminAreaUpdateDto,
    );
  }

  public async deleteAdminAreaOrThrow(placeCode: string): Promise<void> {
    return this.adminAreasRepository.deleteAdminAreaOrThrow(placeCode);
  }
}
