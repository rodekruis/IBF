import { ApiProperty } from '@nestjs/swagger';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { MapLayerDetailsDto } from '@api-service/src/events/dto/map-layer-details.dto';
import {
  AlertClassType,
  DataSourceType,
  HazardType,
} from '@api-service/src/shared-enums';

export class EventResponseDto {
  @ApiProperty()
  public readonly eventId: number;

  @ApiProperty()
  public readonly eventName: string;

  @ApiProperty()
  public readonly eventLabel: string;

  @ApiProperty({ enum: HazardType, isArray: true })
  public readonly hazardType: HazardType[];

  @ApiProperty({ type: [String] })
  public readonly forecastSources: DataSourceType[];

  @ApiProperty({ enum: AlertClassType })
  public readonly alertClass: AlertClassType;

  @ApiProperty()
  public readonly trigger: boolean;

  @ApiProperty({ type: Array, example: [32.6, 0.35] })
  public readonly centroid: [number, number]; // lon, lat

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

  @ApiProperty({ type: [MapLayerDetailsDto] })
  public readonly availableLayers: MapLayerDetailsDto[];
}
