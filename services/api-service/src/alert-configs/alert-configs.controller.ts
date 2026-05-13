import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigCreateDto } from '@api-service/src/alert-configs/dto/alert-config-create.dto';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
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
    summary: 'Get alert configs for country and hazard type',
  })
  @ApiQuery({ name: 'countryCodeIso3', required: false, example: 'KEN' })
  @ApiQuery({ name: 'hazardType', required: false, enum: HazardType })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert configs returned successfully',
    type: [AlertConfigResponseDto],
  })
  public async getAlertConfigs(
    @Query('countryCodeIso3') countryCodeIso3?: string,
    @Query('hazardType') hazardType?: string,
  ): Promise<AlertConfigResponseDto[]> {
    let hazardTypeValue: HazardType | undefined = undefined;
    if (hazardType !== undefined) {
      if (Object.values(HazardType).includes(hazardType as HazardType)) {
        hazardTypeValue = hazardType as HazardType;
      } else {
        throw new BadRequestException(
          `Invalid hazardType "${hazardType}". Valid values: ${Object.values(HazardType).join(', ')}`,
        );
      }
    }

    return this.alertConfigsService.getAlertConfigs({
      countryCodeIso3,
      hazardType: hazardTypeValue,
    });
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @ApiOperation({
    summary: 'Create alert config for country and hazard type',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Alert config created successfully',
    type: AlertConfigResponseDto,
  })
  public async createAlertConfig(
    @Body() alertConfigCreateDto: AlertConfigCreateDto,
  ): Promise<AlertConfigResponseDto> {
    return this.alertConfigsService.createAlertConfig(alertConfigCreateDto);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete alert config by id' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Alert config deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert config not found',
  })
  public async deleteAlertConfig(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.alertConfigsService.deleteAlertConfigOrThrow(id);
  }
}
