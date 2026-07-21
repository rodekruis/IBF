import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CountryCreateDto } from '@api-service/src/countries/dto/country-create.dto';
import { CountryResponseDto } from '@api-service/src/countries/dto/country-response.dto';
import { CountryUpdateDto } from '@api-service/src/countries/dto/country-update.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { HazardType } from '@api-service/src/shared-enums';

const countrySelect = {
  id: true,
  created: true,
  updated: true,
  countryCodeIso3: true,
  countryCodeIso2: true,
  countryName: true,
} as const;

const countryWithHazardTypesSelect = {
  ...countrySelect,
  alertConfigs: {
    select: { hazardType: true },
  },
};

type CountryRow = Prisma.CountryGetPayload<{ select: typeof countrySelect }>;
type CountryWithConfigsRow = Prisma.CountryGetPayload<{
  select: typeof countryWithHazardTypesSelect;
}>;

export interface CountryWithHazardTypes extends CountryBaseDto {
  readonly hazardTypes: HazardType[];
}

export type CountryBaseDto = Omit<CountryResponseDto, 'availableLayers'>;

@Injectable()
export class CountriesRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toBaseDto(row: CountryRow): CountryBaseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      countryCodeIso3: row.countryCodeIso3,
      countryCodeIso2: row.countryCodeIso2,
      countryName: row.countryName,
    };
  }

  private toCountryWithHazardTypes(
    row: CountryWithConfigsRow,
  ): CountryWithHazardTypes {
    return {
      ...this.toBaseDto(row),
      hazardTypes: [...new Set(row.alertConfigs.map((c) => c.hazardType))],
    };
  }

  public async getCountriesWithHazardTypes(): Promise<
    CountryWithHazardTypes[]
  > {
    const rows = await this.prisma.country.findMany({
      select: countryWithHazardTypesSelect,
      orderBy: { countryName: 'asc' },
    });
    return rows.map((row) => this.toCountryWithHazardTypes(row));
  }

  public async getCountryWithHazardTypesOrThrow(
    countryCodeIso3: string,
  ): Promise<CountryWithHazardTypes> {
    const row = await this.prisma.country.findUnique({
      where: { countryCodeIso3 },
      select: countryWithHazardTypesSelect,
    });
    if (!row) {
      throw new NotFoundException(`Country '${countryCodeIso3}' not found`);
    }
    return this.toCountryWithHazardTypes(row);
  }

  public async getCountries(): Promise<CountryBaseDto[]> {
    const rows = await this.prisma.country.findMany({
      select: countrySelect,
      orderBy: { countryName: 'asc' },
    });
    return rows.map((row) => this.toBaseDto(row));
  }

  public async createCountries(
    dtos: CountryCreateDto[],
  ): Promise<CountryBaseDto[]> {
    try {
      const rows = await this.prisma.$transaction(
        dtos.map((dto) =>
          this.prisma.country.create({
            data: {
              countryCodeIso3: dto.countryCodeIso3,
              countryCodeIso2: dto.countryCodeIso2,
              countryName: dto.countryName,
            },
            select: countrySelect,
          }),
        ),
      );
      return rows.map((row) => this.toBaseDto(row));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('One or more countries already exist');
        }
      }
      throw error;
    }
  }

  public async updateCountryOrThrow(
    countryCodeIso3: string,
    countryUpdateDto: CountryUpdateDto,
  ): Promise<CountryBaseDto> {
    try {
      const row = await this.prisma.country.update({
        where: { countryCodeIso3 },
        data: {
          countryCodeIso2: countryUpdateDto.countryCodeIso2,
          countryName: countryUpdateDto.countryName,
        },
        select: countrySelect,
      });
      return this.toBaseDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Country '${countryCodeIso3}' not found`);
        }
      }
      throw error;
    }
  }

  public async deleteCountryOrThrow(countryCodeIso3: string): Promise<void> {
    const row = await this.prisma.country.findUnique({
      where: { countryCodeIso3 },
    });
    if (!row) {
      throw new NotFoundException(`Country '${countryCodeIso3}' not found`);
    }
    try {
      await this.prisma.country.delete({ where: { countryCodeIso3 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException(
            `Cannot delete country '${countryCodeIso3}': it is still referenced by other records`,
          );
        }
      }
      throw error;
    }
  }
}
