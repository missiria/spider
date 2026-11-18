import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { PropertiesModule } from '../properties/properties.module';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscQuotaUsage } from './entities/gsc-quota-usage.entity';
import { GscSitemap } from './entities/gsc-sitemap.entity';
import { IndexingExample } from './entities/indexing-example.entity';
import { IndexingImport } from './entities/indexing-import.entity';
import { IndexingReason } from './entities/indexing-reason.entity';
import { IndexingTrend } from './entities/indexing-trend.entity';
import { TrackedUrl } from './entities/tracked-url.entity';
import { UrlInspection } from './entities/url-inspection.entity';
import { IndexingCollectorService } from './indexing-collector.service';
import { IndexingController } from './indexing.controller';
import { IndexingScheduler } from './indexing.scheduler';
import { IndexingService } from './indexing.service';

/** Page indexing (MITP-0833, ADR-0009). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IndexingImport,
      IndexingReason,
      IndexingTrend,
      IndexingExample,
      TrackedUrl,
      UrlInspection,
      GscSitemap,
      GscQuotaUsage,
      SyncRun,
      DimensionMetric,
    ]),
    GscModule,
    PropertiesModule,
  ],
  providers: [IndexingService, IndexingCollectorService, IndexingScheduler],
  controllers: [IndexingController],
  exports: [IndexingService, IndexingCollectorService],
})
export class IndexingModule {}
