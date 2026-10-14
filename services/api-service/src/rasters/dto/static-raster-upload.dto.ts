import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

import { LayerName } from '@api-service/src/shared-enums';

const UPLOADABLE_STATIC_RASTER_LAYERS = [LayerName.populationDensity] as const;

export type UploadableStaticRasterLayer =
  (typeof UPLOADABLE_STATIC_RASTER_LAYERS)[number];

export class StaticRasterUploadDto {
  @ApiProperty({ example: 'MWI' })
  @IsString()
  @IsNotEmpty()
  public readonly countryCodeIso3: string;

  @ApiProperty({
    enum: [...UPLOADABLE_STATIC_RASTER_LAYERS],
    example: LayerName.populationDensity,
  })
  @IsIn(UPLOADABLE_STATIC_RASTER_LAYERS)
  public readonly layer: UploadableStaticRasterLayer;
}

export class StaticRasterUploadFormDto extends StaticRasterUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Data PNG (RGBA-encoded float values)',
  })
  public readonly data: Express.Multer.File;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Metadata JSON with StaticRasterSourceMetadataDto fields, e.g. <ISO3>_population_metadata.json',
  })
  public readonly metadata: Express.Multer.File;
}
