import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';

class RasterDataMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:4326' })
  @IsString()
  public readonly crs: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  public readonly nodata: number;
}

class RasterColouredMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ example: 'EPSG:3857' })
  @IsString()
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
