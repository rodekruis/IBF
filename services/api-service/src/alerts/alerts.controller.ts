import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import {
  CreateAlertDto,
  ReadAlertDto,
} from '@api-service/src/alerts/dto/alert.dto';
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
  @ApiOperation({ summary: 'Get alerts' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alerts returned successfully',
    type: [ReadAlertDto],
  })
  public async getAlerts(): Promise<ReadAlertDto[]> {
    return this.alertsService.getAlerts();
  }

  @AuthenticatedUser()
  @Get(':id')
  @ApiOperation({ summary: 'Get alert by id' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert returned successfully',
    type: ReadAlertDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert not found',
  })
  public async getAlert(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ReadAlertDto> {
    return this.alertsService.getAlertOrThrow(id);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete alert by id' })
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
  @ApiBody({ type: [CreateAlertDto] })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Alerts persisted successfully',
    type: [ReadAlertDto],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Integrity check failed',
  })
  public async createAlerts(
    @Body(
      new ParseArrayPipe({ items: CreateAlertDto, ...ValidationPipeOptions }),
    )
    createAlertDtos: CreateAlertDto[],
  ): Promise<ReadAlertDto[]> {
    return this.alertsService.createAlerts(createAlertDtos);
  }
}
