import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty()
  public readonly id: number;

  @ApiProperty()
  public readonly eventName: string;

  @ApiProperty({ type: [String] })
  public readonly hazardTypes: string[];

  @ApiProperty({ type: [String] })
  public readonly forecastSources: string[];

  @ApiProperty()
  public readonly alertClass: string;

  @ApiProperty()
  public readonly trigger: boolean;

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
  public readonly created: Date;

  @ApiProperty()
  public readonly updated: Date;

  @ApiProperty()
  public readonly isOngoing: boolean;
}
