import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from '../events/events.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getStats(
    @Query('source') source?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.eventsService.getStats({ source, from, to });
  }
}
