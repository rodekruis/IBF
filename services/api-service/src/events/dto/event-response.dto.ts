import { ApiProperty } from '@nestjs/swagger';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { LayerDto } from '@api-service/src/events/dto/layer.dto';
import {
  AlertClass,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';

export class EventResponseDto {
  @ApiProperty()
  public readonly eventId: number;

  @ApiProperty()
  public readonly eventName: string;

  @ApiProperty()
  public readonly eventLabel: string;

  @ApiProperty({ enum: HazardType })
  public readonly hazardType: HazardType;

  @ApiProperty({ enum: ForecastSource, isArray: true })
  public readonly forecastSources: ForecastSource[];

  @ApiProperty({ enum: AlertClass })
  public readonly alertClass: AlertClass;

  @ApiProperty()
  public readonly trigger: boolean;

  @ApiProperty({ type: Object, example: { latitude: 0.35, longitude: 32.6 } })
  public readonly centroid: { latitude: number; longitude: number };

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly startAt: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly reachesPeakAlertClassAt: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly endAt: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly firstIssuedAt: string;

  @ApiProperty({ example: '2026-03-20T23:59:59Z' })
  public readonly lastUpdatedAt: string;

  @ApiProperty()
  public readonly isOngoing: boolean;

  @ApiProperty({ type: [ExposedAdminAreaDto] })
  public readonly exposedAdminAreas: ExposedAdminAreaDto[];

  @ApiProperty({ type: [LayerDto] })
  public readonly availableLayers: LayerDto[];
}
