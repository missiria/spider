import { Controller, Get, Query } from '@nestjs/common';
import { OverviewService } from './overview.service';

@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  fleet(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('days') days?: string,
  ) {
    return this.overview.fleet({ start, end, days: days ? Number(days) : undefined });
  }

  @Get('series')
  series(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('days') days?: string,
  ) {
    return this.overview.series({ start, end, days: days ? Number(days) : undefined });
  }
}
