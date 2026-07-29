import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { APP_VERSION } from '@api-service/src/config';
import { GetVersionDto } from '@api-service/src/health/dto/get-version.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

@ApiTags('--- root ---')
@Controller()
export class HealthController {
  public constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get health of instance' })
  @HealthCheck()
  public check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
    ]);
  }

  @Get('version')
  @ApiOperation({ summary: 'Get version of instance' })
  public version(): GetVersionDto {
    const version = APP_VERSION;

    // See: https://shields.io/endpoint
    return {
      schemaVersion: 1,
      label: 'build',
      message: !!version ? version.trim() : 'n/a',
      isError: !version,
    };
  }
}
