import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { SubmitAlertsDto } from '@api-service/src/alerts/dto/submit-alerts.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('alerts')
@UseGuards(AuthenticatedUserGuard)
@Controller('alerts')
export class AlertsController {
  public constructor(private readonly alertsService: AlertsService) {}

  @AuthenticatedUser({ allowPipelineApiKey: true })
  @Post()
  @ApiOperation({ summary: 'Submit forecast alerts' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Alerts persisted successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Integrity check failed',
  })
  public async submitAlerts(
    @Body() submitAlertsDto: SubmitAlertsDto,
  ): Promise<void> {
    await this.alertsService.submitAlerts(submitAlertsDto);
  }
}
