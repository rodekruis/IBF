import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all open events',
    type: [EventResponseDto],
  })
  public async getOpenEvents(): Promise<EventResponseDto[]> {
    return this.eventsService.getOpenEvents();
  }
}
