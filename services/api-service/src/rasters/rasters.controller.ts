import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RasterResponseDto } from '@api-service/src/rasters/dto/raster-response.dto';
import { RastersService } from '@api-service/src/rasters/rasters.service';

@ApiTags('rasters')
@Controller('rasters')
export class RastersController {
  public constructor(private readonly rastersService: RastersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get a raster layer by its resource ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Raster returned successfully',
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
}
