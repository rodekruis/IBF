import {
  Body,
  Controller,
  HttpStatus,
  ParseArrayPipe,
  ParseBoolPipe,
  Post,
  Query,
  Res,
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
import { WrapperType } from '@api-service/src/wrapper.type';

class SecretDto {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;
}

@ApiTags('--- seed ---')
@Controller('seed')
export class SeedController {
  public constructor(private readonly seedService: SeedService) {}

  @Post('/reset')
  @ApiOperation({
    summary: 'Reset database and seed initial (non-event) data.',
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
      'If true, skip seeding static rasters (population) to speed up resets.',
  })
  @ApiQuery({
    name: 'countryCodes',
    required: false,
    type: String,
    example: 'MWI',
    description:
      'ISO3 country codes to seed, comma-separated (e.g. MWI,UGA). If omitted, all countries are seeded.',
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
    @Res() res,
  ): Promise<void> {
    if (IS_PRODUCTION) {
      res
        .status(HttpStatus.FORBIDDEN)
        .send('Reset is not allowed in production');
      return;
    }
    if (body.secret !== env.RESET_SECRET) {
      res.status(HttpStatus.FORBIDDEN).send('Not allowed');
      return;
    }

    await this.seedService.reset({
      resetIdentifier,
      countryCodes,
      skipStaticRasters: skipStaticRasters ?? false,
    });

    res.status(HttpStatus.OK).send('Database reset to initial state.');
  }

  @Post('/mock-events')
  @ApiOperation({
    summary: 'Generate mock events for a country.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mock scenario applied.',
  })
  @ApiQuery({
    name: 'countryCode',
    required: true,
    type: String,
    example: 'MWI',
    description:
      'ISO3 country code to generate mock events for. Supported: ETH, MWI, UGA.',
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
    @Query('countryCode') countryCode: string,
    @Query('scenario') scenario: WrapperType<MockScenario>,
    @Query('clearEvents', new ParseBoolPipe({ optional: true }))
    clearEvents: boolean,
    @Query('issuedAt') issuedAt: string | undefined,
    @Res() res,
  ): Promise<void> {
    if (IS_PRODUCTION) {
      res
        .status(HttpStatus.FORBIDDEN)
        .send('Mock events are not allowed in production');
      return;
    }
    if (body.secret !== env.RESET_SECRET) {
      res.status(HttpStatus.FORBIDDEN).send('Not allowed');
      return;
    }

    await this.seedService.mockEvents({
      countryCode,
      scenario,
      clearEvents: clearEvents ?? false,
      issuedAt: issuedAt ? new Date(issuedAt) : undefined,
    });

    res
      .status(HttpStatus.OK)
      .header('Content-Type', 'text/plain')
      .send(
        `Mock scenario '${scenario}' applied for ${countryCode}. clearEvents: ${String(clearEvents ?? false)}. issuedAt: ${issuedAt ?? 'now'}.`,
      );
  }
}
