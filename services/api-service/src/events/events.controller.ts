import {
  Controller,
  Get,
  HttpStatus,
  ParseBoolPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { EventsService } from '@api-service/src/events/events.service';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('events')
@UseGuards(AuthenticatedUserGuard)
@Controller('events')
export class EventsController {
  public constructor(private readonly eventsService: EventsService) {}

  @AuthenticatedUser()
  @Get()
  @ApiOperation({ summary: 'Get all active or all closed events' })
  @ApiQuery({
    name: 'active',
    type: Boolean,
    required: false,
    default: true, // This defines Swagger default only.
    description:
      'Use to filter active or closed events that were ongoing at the time of the request.',
  })
  @ApiQuery({
    name: 'timestamp',
    type: String,
    required: false,
    description:
      'NOTE: only use for mock/testing, never in production. ISO 8601 timestamp used to determine if ongoing at time of request. Defaults to now.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Returns events based on the active-status and request-timestamp',
    type: [EventResponseDto],
  })
  public async getEvents(
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
    @Query('timestamp') timestamp?: string,
  ): Promise<EventResponseDto[]> {
    const viewTime = timestamp ? new Date(timestamp) : new Date();
    return this.eventsService.getEvents(viewTime, active);
  }
}
