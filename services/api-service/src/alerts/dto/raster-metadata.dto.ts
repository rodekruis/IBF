import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { EPSG } from '@api-service/src/shared/enum/epsg.enum';

class RasterDataMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ enum: EPSG, example: EPSG.WGS84 })
  @IsEnum(EPSG)
  public readonly crs: EPSG;

  @ApiProperty({ example: 0 })
  @IsNumber()
  public readonly nodata: number;
}

class RasterColouredMetadata {
  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;

  @ApiProperty({ enum: EPSG, example: EPSG.WebMercator })
  @IsEnum(EPSG)
  public readonly crs: EPSG;
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
