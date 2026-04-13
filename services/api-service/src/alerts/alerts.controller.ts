import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { AlertReadDto } from '@api-service/src/alerts/dto/alert-read.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';
import { ValidationPipeOptions } from '@api-service/src/validation-options/validation-pipe-options.const';

@ApiTags('alerts')
@UseGuards(AuthenticatedUserGuard)
@Controller('alerts')
export class AlertsController {
  public constructor(private readonly alertsService: AlertsService) {}

  @AuthenticatedUser()
  @Get()
  @ApiOperation({
    summary:
      'Get alerts. This endpoint is not intended for use in pipelines or frontends, only for debugging.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alerts returned successfully',
    type: [AlertReadDto],
  })
  public async getAlerts(): Promise<AlertReadDto[]> {
    return this.alertsService.getAlerts();
  }

  @AuthenticatedUser()
  @Get(':id')
  @ApiOperation({
    summary:
      'Get alert by id. This endpoint is not intended for use in pipelines or frontends, only for debugging.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert returned successfully',
    type: AlertReadDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert not found',
  })
  public async getAlert(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AlertReadDto> {
    return this.alertsService.getAlertOrThrow(id);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete alert by id. This endpoint is not intended for use in pipelines or frontends, only for debugging.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Alert deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert not found',
  })
  public async deleteAlert(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.alertsService.deleteAlertOrThrow(id);
  }

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Post()
  @ApiOperation({ summary: 'Create forecast alerts' })
  @ApiBody({ type: ForecastCreateDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Alerts persisted successfully',
    type: [AlertReadDto],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Integrity check failed',
  })
  public async createAlerts(
    @Body(new ValidationPipe({ ...ValidationPipeOptions, transform: true }))
    forecastCreateDto: ForecastCreateDto,
  ): Promise<AlertReadDto[]> {
    return await this.alertsService.createAlerts(forecastCreateDto);
  }
}
