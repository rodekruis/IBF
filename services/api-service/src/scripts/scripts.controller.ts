import {
  Body,
  Controller,
  HttpStatus,
  ParseBoolPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { IS_PRODUCTION } from '@api-service/src/config';
import { env } from '@api-service/src/env';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { ScriptsService } from '@api-service/src/scripts/scripts.service';
import { WrapperType } from '@api-service/src/wrapper.type';

class SecretDto {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;
}

@ApiTags('--- instance ---')
@Controller('instance')
export class ScriptsController {
  public constructor(private readonly scriptsService: ScriptsService) {}

  @ApiQuery({
    name: 'script',
    enum: SeedScript,
    isArray: true,
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
  @ApiOperation({
    summary: `Reset instance database.`,
  })
  @Post('/reset')
  public async resetDb(
    @Body() body: SecretDto,
    @Query('script') script: WrapperType<SeedScript>,
    @Query('resetIdentifier') resetIdentifier: string,
    @Query('skipStaticRasters', new ParseBoolPipe({ optional: true }))
    skipStaticRasters: boolean,
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

    await this.scriptsService.loadSeedScenario({
      resetIdentifier,
      seedScript: script,
      skipStaticRasters: skipStaticRasters ?? false,
    });

    res
      .status(HttpStatus.ACCEPTED)
      .send('Request received. Database should be reset.');
  }
}
