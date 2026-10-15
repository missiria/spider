import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { PropertiesModule } from '../properties/properties.module';
import { SyncRun } from './entities/sync-run.entity';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyMetric, DimensionMetric, SyncRun]),
    GscModule,
    PropertiesModule,
  ],
  providers: [SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
