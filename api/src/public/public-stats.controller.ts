import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PublicStats, PublicStatsService } from './public-stats.service';

/** GET /api/public/stats: anonymous, aggregate-only, cached one hour (MISS-0129). */
@Public()
@Controller('public')
export class PublicStatsController {
  constructor(private readonly stats: PublicStatsService) {}

  @Get('stats')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=300')
  get(): Promise<PublicStats> {
    return this.stats.stats();
  }
}
