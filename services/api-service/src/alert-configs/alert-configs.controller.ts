import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('alert-configs')
@UseGuards(AuthenticatedUserGuard)
@Controller('alert-configs')
export class AlertConfigsController {
  public constructor(
    private readonly alertConfigsService: AlertConfigsService,
  ) {}

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get()
  @ApiOperation({
    summary:
      'Get spatial and temporal extents for alert configs by country and hazard type',
  })
  @ApiQuery({ name: 'countryCodeIso3', required: true, example: 'KEN' })
  @ApiQuery({ name: 'hazardType', required: true, example: 'floods' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert configs returned successfully',
    type: [AlertConfigResponseDto],
  })
  public async getAlertConfigs(
    @Query('countryCodeIso3') countryCodeIso3: string,
    @Query('hazardType') hazardType: string,
  ): Promise<AlertConfigResponseDto[]> {
    return this.alertConfigsService.getAlertConfigs({
      countryCodeIso3,
      hazardType,
    });
  }
}
