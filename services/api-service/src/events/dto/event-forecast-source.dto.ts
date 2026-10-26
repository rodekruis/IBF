import { ApiProperty } from '@nestjs/swagger';

import { ForecastSource } from '@api-service/src/shared-enums';

export class EventForecastSourceDto {
  @ApiProperty({
    enum: ForecastSource,
    example: ForecastSource.glofasRiverDischarge,
  })
  public readonly name: ForecastSource;

  @ApiProperty({ example: 'Forecast river discharge' })
  public readonly title: string;

  @ApiProperty({ example: 'GloFAS medium-range flood forecasts' })
  public readonly dataset: string;

  @ApiProperty({
    example: 'Copernicus Emergency Management Service (GloFAS, ECMWF)',
  })
  public readonly provider: string;

  @ApiProperty({
    description:
      'Update frequency for forecasts, or year of data for static datasets',
    example: 'daily',
  })
  public readonly lastUpdated: string;

  @ApiProperty()
  public readonly description: string;

  @ApiProperty({ example: 'WorldPop: Population Counts' })
  public readonly moreInfoLabel: string;

  @ApiProperty({ example: 'https://hub.worldpop.org/project/categories?id=3' })
  public readonly moreInfoUrl: string;
}
