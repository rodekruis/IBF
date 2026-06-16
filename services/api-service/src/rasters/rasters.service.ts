import { Injectable } from '@nestjs/common';

import { RasterResponseDto } from '@api-service/src/rasters/dto/raster-response.dto';
import { RastersRepository } from '@api-service/src/rasters/rasters.repository';

@Injectable()
export class RastersService {
  public constructor(private readonly rastersRepository: RastersRepository) {}

  public async getRasterOrThrow(id: number): Promise<RasterResponseDto> {
    return this.rastersRepository.getRasterOrThrow(id);
  }

  public async getRasterImageOrThrow(id: number): Promise<Buffer> {
    return this.rastersRepository.getRasterImageOrThrow(id);
  }
}
