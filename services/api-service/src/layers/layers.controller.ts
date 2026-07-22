import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';
import { LayerCreateDto } from '@api-service/src/layers/dto/layer-create.dto';
import { LayerReadDto } from '@api-service/src/layers/dto/layer-read.dto';
import { LayerUpdateDto } from '@api-service/src/layers/dto/layer-update.dto';
import { LayersService } from '@api-service/src/layers/layers.service';
import { LayerName } from '@api-service/src/shared-enums';

@ApiTags('layers')
@Controller('layers')
export class LayersController {
  public constructor(private readonly layersService: LayersService) {}

  private parseLayerNameOrThrow(value: string): LayerName {
    const values = Object.values(LayerName) as string[];
    if (!values.includes(value)) {
      throw new BadRequestException(
        `Invalid layer name '${value}'. Allowed values: ${values.join(', ')}`,
      );
    }
    return value as LayerName;
  }

  @Get()
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @ApiOperation({
    summary: 'Get all layers. Admin endpoint for managing configuration.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [LayerReadDto] })
  public async getLayers(): Promise<LayerReadDto[]> {
    return this.layersService.getLayers();
  }

  @Post()
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @ApiOperation({
    summary: 'Create a layer. Admin endpoint for managing configuration.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: LayerReadDto })
  public async createLayer(@Body() dto: LayerCreateDto): Promise<LayerReadDto> {
    return this.layersService.createLayer(dto);
  }

  @Patch(':layerName')
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @ApiOperation({
    summary: 'Update a layer. Admin endpoint for managing configuration.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: LayerReadDto })
  public async updateLayer(
    @Param('layerName') layerNameParam: string,
    @Body() dto: LayerUpdateDto,
  ): Promise<LayerReadDto> {
    const layerName = this.parseLayerNameOrThrow(layerNameParam);
    return this.layersService.updateLayerOrThrow(layerName, dto);
  }

  @Delete(':layerName')
  @UseGuards(AuthenticatedUserGuard)
  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a layer. Admin endpoint for managing configuration.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  public async deleteLayer(
    @Param('layerName') layerNameParam: string,
  ): Promise<void> {
    const layerName = this.parseLayerNameOrThrow(layerNameParam);
    await this.layersService.deleteLayerOrThrow(layerName);
  }
}
