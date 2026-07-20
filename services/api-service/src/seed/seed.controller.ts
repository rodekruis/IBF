import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { SUPPORTED_MOCK_COUNTRIES } from '@api-service/src/seed/seed-data/mock-events.helper';

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

  @Get('/reset/status')
  @ApiOperation({
    summary: 'Check whether a database reset is currently in progress.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current reset status.',
  })
  public getResetStatus(): { inProgress: boolean; error: string | null } {
    if (IS_PRODUCTION) {
      throw new ForbiddenException(
        'Reset status is not available in production',
      );
    }
    return this.seedService.getResetStatus();
  }

  @Post('/reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reset database and seed initial (non-event) data.',
    description:
      'Drops all data and re-seeds initial static data (admin areas, countries, etc.). ' +
      'Call for one, multiple, or all countries. ' +
      'Not available in production. ' +
      'Returns immediately; seeding continues in the background.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Database reset started.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A reset is already in progress.',
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
  public resetDb(
    @Body() body: SecretDto,
    @Query(
      'countryCodes',
      new ParseArrayPipe({ items: String, optional: true }),
    )
    countryCodes: string[] | undefined,
    @Query('skipStaticRasters', new ParseBoolPipe({ optional: true }))
    skipStaticRasters: boolean,
    @Query('resetIdentifier') resetIdentifier: string,
  ): string {
    if (IS_PRODUCTION) {
      throw new ForbiddenException('Reset is not allowed in production');
    }
    if (body.secret !== env.RESET_SECRET) {
      throw new ForbiddenException('Not allowed');
    }

    this.seedService.startReset({
      resetIdentifier,
      countryCodes: countryCodes?.map((code) => code.trim()),
      skipStaticRasters: skipStaticRasters ?? false,
    });

    return 'Database reset started. Seeding continues in the background.';
  }

  @Post('/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate mock events for one, multiple, or all countries.',
    description:
      'Creates mock forecast events, for testing without pipeline data. ' +
      'Call for one, multiple, or all supported countries. ' +
      'Not available in production.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mock scenario applied.',
  })
  @ApiQuery({
    name: 'countryCodes',
    required: false,
    type: String,
    example: 'MWI',
    description:
      'ISO3 country codes to mock. Provide comma-separated (e.g. MWI,KEN). ' +
      'If omitted, all seeded countries with mock support are mocked.',
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
      'If true, clear existing events for the given countries before creating new ones.',
  })
  @ApiQuery({
    name: 'issuedAt',
    required: false,
    type: String,
    description: `ISO8601 date for the forecast issuedAt (e.g. ${new Date().toISOString()}). Defaults to now.`,
  })
  public async mockEvents(
    @Body() body: SecretDto,
    @Query(
      'countryCodes',
      new ParseArrayPipe({ items: String, optional: true }),
    )
    countryCodes: string[] | undefined,
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

    const resolvedCountryCodes = countryCodes
      ? Array.from(new Set(countryCodes.map((code) => code.trim())))
      : undefined;

    if (resolvedCountryCodes) {
      const unsupported = resolvedCountryCodes.filter(
        (code) => !SUPPORTED_MOCK_COUNTRIES.includes(code),
      );
      if (unsupported.length > 0) {
        throw new BadRequestException(
          `Unsupported countries: ${unsupported.join(', ')}. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
        );
      }
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
      countryCodes: resolvedCountryCodes,
      scenario: scenario as MockScenario,
      clearEvents: clearEvents ?? false,
      issuedAt: issuedAtDate,
    });

    return `Mock scenario(s) applied`;
  }
}
