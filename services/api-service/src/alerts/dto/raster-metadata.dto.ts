import { ApiProperty } from '@nestjs/swagger';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';

class RasterDataMetadata {
  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:4326' })
  public readonly crs: string;

  @ApiProperty({ example: 0 })
  public readonly nodata: number;
}

class RasterColouredMetadata {
  @ApiProperty({ type: RasterExtentDto })
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:3857' })
  public readonly crs: string;
}

export class RasterMetadataDto {
  @ApiProperty({ type: RasterDataMetadata })
  public readonly data: RasterDataMetadata;

  @ApiProperty({ type: RasterColouredMetadata })
  public readonly coloured: RasterColouredMetadata;
}
