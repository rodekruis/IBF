import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';

import { RasterResponseDto } from '@api-service/src/rasters/dto/raster-response.dto';
import { RastersService } from '@api-service/src/rasters/rasters.service';

@ApiTags('rasters')
@Controller('rasters')
export class RastersController {
  public constructor(private readonly rastersService: RastersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get raster metadata by its resource ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Raster metadata returned successfully',
    type: RasterResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Raster not found',
  })
  public async getRaster(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RasterResponseDto> {
    return this.rastersService.getRasterOrThrow(id);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Get the coloured raster image as a PNG' })
  @ApiProduces('image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'PNG image returned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Raster not found',
  })
  public async getRasterImage(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.rastersService.getRasterImageOrThrow(id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(buffer);
  }
}
