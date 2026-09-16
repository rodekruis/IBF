import { ApiProperty } from '@nestjs/swagger';

import { WaterDischargeTimeSeriesEntryDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import { AlertClassificationLevel } from '@api-service/src/shared-enums';

export class ReturnPeriodThresholdDto {
  @ApiProperty({ example: 5 })
  public readonly returnPeriod: number;

  @ApiProperty({ example: 1800 })
  public readonly thresholdValue: number;

  @ApiProperty({
    enum: AlertClassificationLevel,
    example: AlertClassificationLevel.medium,
    nullable: true,
  })
  public readonly severityClass: AlertClassificationLevel | null;
}

export class EventFloodsAlertDetailsDto {
  @ApiProperty({ type: [WaterDischargeTimeSeriesEntryDto] })
  public readonly timeSeries: WaterDischargeTimeSeriesEntryDto[];

  @ApiProperty({ example: 100 })
  public readonly current: number;

  @ApiProperty({ example: '2026-03-23T00:00:00Z' })
  public readonly peakDay: string;

  @ApiProperty({ example: 150 })
  public readonly peakValue: number;

  @ApiProperty({ example: 10, nullable: true })
  public readonly returnPeriod: number | null;

  @ApiProperty({ example: 0.62, nullable: true })
  public readonly probabilityOfExceedance: number | null;
}

export class EventFloodsDetailsDto {
  @ApiProperty({ example: 'G5142' })
  public readonly stationCode: string;

  @ApiProperty({ example: 'ATHI MUNYU (3DA02)', nullable: true })
  public readonly stationName: string | null;

  @ApiProperty({ type: EventFloodsAlertDetailsDto })
  public readonly alertDetails: EventFloodsAlertDetailsDto;

  @ApiProperty({ type: [ReturnPeriodThresholdDto] })
  public readonly returnPeriodThresholds: ReturnPeriodThresholdDto[];
}
