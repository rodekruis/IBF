import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';

class RasterDataMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:4326' })
  public readonly crs: string;

  @ApiProperty({ example: 0 })
  public readonly nodata: number;
}

class RasterColouredMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:3857' })
  public readonly crs: string;
}

export class RasterMetadataDto {
  @ApiProperty({ type: RasterDataMetadata })
  @ValidateNested()
  @Type(() => RasterDataMetadata)
  public readonly data: RasterDataMetadata;

  @ApiProperty({ type: RasterColouredMetadata })
  @ValidateNested()
  @Type(() => RasterColouredMetadata)
  public readonly coloured: RasterColouredMetadata;
}
