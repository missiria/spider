import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { TopRow } from '../metrics/entities/top-row.entity';
import { PropertiesModule } from '../properties/properties.module';
import { SyncRun } from './entities/sync-run.entity';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyMetric, TopRow, SyncRun]),
    GscModule,
    PropertiesModule,
  ],
  providers: [SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
