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

const countrySelect = {
  id: true,
  created: true,
  updated: true,
  countryCodeIso3: true,
  countryCodeIso2: true,
  countryName: true,
} as const;

type CountryRow = Prisma.CountryGetPayload<{ select: typeof countrySelect }>;

@Injectable()
export class CountriesRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(row: CountryRow): CountryResponseDto {
    return {
      id: row.id,
      created: row.created,
      updated: row.updated,
      countryCodeIso3: row.countryCodeIso3,
      countryCodeIso2: row.countryCodeIso2,
      countryName: row.countryName,
    };
  }

  public async getCountries(): Promise<CountryResponseDto[]> {
    const rows = await this.prisma.country.findMany({
      select: countrySelect,
      orderBy: { countryName: 'asc' },
    });
    return rows.map((row) => this.toResponseDto(row));
  }

  public async getCountryOrThrow(
    countryCodeIso3: string,
  ): Promise<CountryResponseDto> {
    const row = await this.prisma.country.findUnique({
      where: { countryCodeIso3 },
      select: countrySelect,
    });
    if (!row) {
      throw new NotFoundException(`Country '${countryCodeIso3}' not found`);
    }
    return this.toResponseDto(row);
  }

  public async createCountry(
    countryCreateDto: CountryCreateDto,
  ): Promise<CountryResponseDto> {
    try {
      const row = await this.prisma.country.create({
        data: {
          countryCodeIso3: countryCreateDto.countryCodeIso3,
          countryCodeIso2: countryCreateDto.countryCodeIso2,
          countryName: countryCreateDto.countryName,
        },
        select: countrySelect,
      });
      return this.toResponseDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Country '${countryCreateDto.countryCodeIso3}' already exists`,
          );
        }
      }
      throw error;
    }
  }

  public async updateCountryOrThrow(
    countryCodeIso3: string,
    countryUpdateDto: CountryUpdateDto,
  ): Promise<CountryResponseDto> {
    try {
      const row = await this.prisma.country.update({
        where: { countryCodeIso3 },
        data: {
          countryCodeIso2: countryUpdateDto.countryCodeIso2,
          countryName: countryUpdateDto.countryName,
        },
        select: countrySelect,
      });
      return this.toResponseDto(row);
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
