import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Get all open events' })
  @ApiQuery({
    name: 'timestamp',
    type: String,
    required: false,
    description:
      'ISO 8601 timestamp used to determine if ongoing at time of request. Defaults to now.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all open events',
    type: [EventResponseDto],
  })
  public async getOpenEvents(
    @Query('timestamp') timestamp?: string,
  ): Promise<EventResponseDto[]> {
    const viewTime = timestamp ? new Date(timestamp) : new Date();
    return this.eventsService.getOpenEvents(viewTime);
  }
}
