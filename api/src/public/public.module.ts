import { Module } from '@nestjs/common';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';

@Module({
  controllers: [PublicStatsController],
  providers: [PublicStatsService],
})
export class PublicModule {}
