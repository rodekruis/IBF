import { ApiProperty } from '@nestjs/swagger';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { EventLayerDto } from '@api-service/src/layers/dto/event-layer.dto';
import {
  AlertClass,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';

export class EventResponseDto {
  @ApiProperty()
  public readonly eventId: number;

  @ApiProperty({ example: 'KEN' })
  public readonly countryCodeIso3: string;

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

  @ApiProperty({
    description:
      'A mapping of admin level (as a string key) to the exposed admin areas for that level',
    example: { '0': [], '1': [] },
  })
  public readonly exposedAdminAreas: Record<string, ExposedAdminAreaDto[]>;

  @ApiProperty({ type: [EventLayerDto] })
  public readonly availableLayers: EventLayerDto[];
}
