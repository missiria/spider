import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { PropertiesController } from '../properties/properties.controller';
import { PropertiesModule } from '../properties/properties.module';
import { SyncModule } from '../sync/sync.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyMetric, DimensionMetric]),
    PropertiesModule,
    SyncModule,
    GscModule,
  ],
  providers: [OverviewService],
  controllers: [OverviewController, PropertiesController],
  exports: [OverviewService],
})
export class OverviewModule {}
