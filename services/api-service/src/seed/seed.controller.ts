import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  ParseArrayPipe,
  ParseBoolPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { IS_PRODUCTION } from '@api-service/src/config';
import { env } from '@api-service/src/env';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { SeedService } from '@api-service/src/seed/seed.service';

class SecretDto {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;
}

@ApiTags('--- root ---')
@Controller()
export class SeedController {
  public constructor(private readonly seedService: SeedService) {}

  @Post('/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset database and seed initial (non-event) data.',
    description:
      'Drops all data and re-seeds initial static data (admin areas, countries, etc.). ' +
      'Call for one, multiple, or all countries. ' +
      'Not available in production.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Database reset to initial state.',
  })
  @ApiQuery({
    name: 'resetIdentifier',
    required: false,
    description:
      'Optional identifier for this reset action, will be logged by the server.',
  })
  @ApiQuery({
    name: 'skipStaticRasters',
    required: false,
    description:
      'If true, skip seeding static rasters (population) to speed up resets for testing.',
  })
  @ApiQuery({
    name: 'countryCodes',
    required: false,
    type: String,
    example: 'MWI',
    description:
      'ISO3 country codes to seed. Provide comma-separated (e.g. MWI,UGA). If omitted, all countries are seeded.',
  })
  public async resetDb(
    @Body() body: SecretDto,
    @Query(
      'countryCodes',
      new ParseArrayPipe({ items: String, optional: true }),
    )
    countryCodes: string[] | undefined,
    @Query('skipStaticRasters', new ParseBoolPipe({ optional: true }))
    skipStaticRasters: boolean,
    @Query('resetIdentifier') resetIdentifier: string,
  ): Promise<string> {
    if (IS_PRODUCTION) {
      throw new ForbiddenException('Reset is not allowed in production');
    }
    if (body.secret !== env.RESET_SECRET) {
      throw new ForbiddenException('Not allowed');
    }

    await this.seedService.reset({
      resetIdentifier,
      countryCodes: countryCodes?.map((code) => code.trim()),
      skipStaticRasters: skipStaticRasters ?? false,
    });

    return 'Database reset to initial state.';
  }

  @Post('/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate mock events for a single country.',
    description:
      'Creates mock forecast events, for testing without pipeline data. ' +
      'Not available in production.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mock scenario applied.',
  })
  @ApiQuery({
    name: 'countryCodeIso3',
    required: true,
    type: String,
    example: 'MWI',
    description:
      'A single ISO3 country code to generate mock events for. Supported: ETH, KEN, MWI, PHL, SSD, UGA, ZMB.',
  })
  @ApiQuery({
    name: 'scenario',
    enum: MockScenario,
    required: true,
    schema: { default: MockScenario.events },
    description: 'The mock scenario to generate.',
  })
  @ApiQuery({
    name: 'clearEvents',
    required: false,
    enum: ['true', 'false'],
    schema: { default: 'false' },
    description:
      'If true, clear existing events for the given country before creating new ones.',
  })
  @ApiQuery({
    name: 'issuedAt',
    required: false,
    type: String,
    description: `ISO8601 date for the forecast issuedAt (e.g. ${new Date().toISOString()}). Defaults to now.`,
  })
  public async mockEvents(
    @Body() body: SecretDto,
    @Query('countryCodeIso3') countryCodeIso3: string,
    @Query('scenario') scenario: string,
    @Query('clearEvents', new ParseBoolPipe({ optional: true }))
    clearEvents: boolean,
    @Query('issuedAt') issuedAt: string | undefined,
  ): Promise<string> {
    if (IS_PRODUCTION) {
      throw new ForbiddenException('Mock events are not allowed in production');
    }
    if (body.secret !== env.RESET_SECRET) {
      throw new ForbiddenException('Not allowed');
    }

    const validScenarios = Object.values(MockScenario) as string[];
    if (!validScenarios.includes(scenario)) {
      throw new BadRequestException(
        `Invalid scenario '${scenario}'. Supported: ${validScenarios.join(', ')}`,
      );
    }

    const issuedAtDate = issuedAt ? new Date(issuedAt) : new Date();
    if (issuedAt && Number.isNaN(issuedAtDate.getTime())) {
      throw new BadRequestException(
        `Invalid issuedAt '${issuedAt}'. Must be an ISO8601 datetime.`,
      );
    }

    await this.seedService.mockEvents({
      countryCodeIso3,
      scenario: scenario as MockScenario,
      clearEvents: clearEvents ?? false,
      issuedAt: issuedAtDate,
    });

    return 'Mock scenario applied.';
  }
}
