import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { AdminLevelLabelDto } from '@api-service/src/countries/dto/admin-level-label.dto';

@ApiExtraModels(AdminLevelLabelDto)
export class CountryCreateDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  public readonly countryCodeIso3: string;

  @ApiProperty({ example: 'KE' })
  @IsString()
  public readonly countryCodeIso2: string;

  @ApiProperty({ example: 'Kenya' })
  @IsString()
  public readonly countryName: string;

  @ApiPropertyOptional({
    description:
      'A mapping of admin level (as a string key) to the singular/plural label for that level',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(AdminLevelLabelDto) },
    example: {
      '1': { singular: 'County', plural: 'Counties' },
      '2': { singular: 'Subcounty', plural: 'Subcounties' },
      '3': { singular: 'Ward', plural: 'Wards' },
    },
  })
  @IsOptional()
  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => AdminLevelLabelDto)
  public readonly adminLevelLabels?: Record<string, AdminLevelLabelDto>;
}
