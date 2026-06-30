import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { RasterExtentDto } from '@api-service/src/alerts/dto/raster-extent.dto';
import { LayerName } from '@api-service/src/shared-enums';

export class StaticRasterUploadDto {
  @ApiProperty({ example: 'KEN' })
  @IsString()
  @IsNotEmpty()
  public readonly countryCodeIso3: string;

  @ApiProperty({ enum: LayerName, example: LayerName.population })
  @IsEnum(LayerName)
  public readonly layer: LayerName;

  @ApiProperty({
    description: 'Base64-encoded data PNG (RGBA-encoded float values)',
  })
  @IsString()
  @IsNotEmpty()
  public readonly valueBlackWhite: string;

  @ApiProperty({ description: 'Base64-encoded coloured PNG image for display' })
  @IsString()
  @IsNotEmpty()
  public readonly valueColoured: string;

  @ApiProperty({ type: RasterExtentDto })
  @ValidateNested()
  @Type(() => RasterExtentDto)
  public readonly extent: RasterExtentDto;
}
