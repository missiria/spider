import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PropertiesService } from '../properties/properties.service';
import { IndexingCollectorService } from './indexing-collector.service';

/**
 * Daily 05:00 Page indexing collection (MITP-0833): Sitemaps snapshot + URL inventory + up to
 * INDEXING_DAILY_INSPECTIONS URL Inspection calls per connected property, one property after
 * the other. Runs before the 06:10 Search Analytics sync and the 07:30 opportunities scan,
 * which then reads the fresh inspections.
 */
@Injectable()
export class IndexingScheduler {
  private readonly logger = new Logger(IndexingScheduler.name);

  constructor(
    private readonly properties: PropertiesService,
    private readonly collector: IndexingCollectorService,
  ) {}

  @Cron('0 5 * * *')
  async daily(): Promise<void> {
    if (this.collector.getDailyBudget() === 0) return;
    for (const property of await this.properties.findByStatus('connected')) {
      try {
        const run = await this.collector.refresh(property);
        this.logger.log(`indexing ${property.site_url}: ${run.status}`);
      } catch (err) {
        this.logger.warn(
          `indexing ${property.site_url}: ${(err as Error).message}`,
        );
      }
    }
  }
}
