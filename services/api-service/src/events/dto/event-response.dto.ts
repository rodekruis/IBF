import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty()
  public readonly eventId: number;

  @ApiProperty()
  public readonly eventName: string;

  @ApiProperty()
  public readonly eventLabel: string;

  @ApiProperty()
  public readonly hazardType: string;

  @ApiProperty({ type: [String] })
  public readonly forecastSources: string[];

  @ApiProperty()
  public readonly alertClass: string;

  @ApiProperty()
  public readonly trigger: boolean;

  @ApiProperty({ type: Object, example: { latitude: 0.35, longitude: 32.6 } })
  public readonly centroid: { latitude: number; longitude: number };

  @ApiProperty()
  public readonly startAt: Date;

  @ApiProperty()
  public readonly reachesPeakAlertClassAt: Date;

  @ApiProperty()
  public readonly endAt: Date;

  @ApiProperty()
  public readonly firstIssuedAt: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  public readonly closedAt: Date | null;

  @ApiProperty()
  public readonly isOngoing: boolean;
}
