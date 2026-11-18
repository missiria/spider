import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncRun } from '../sync/entities/sync-run.entity';
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
export class IndexingScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexingScheduler.name);

  constructor(
    private readonly properties: PropertiesService,
    private readonly collector: IndexingCollectorService,
    private readonly config: ConfigService,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
  ) {}

  /**
   * First collection without waiting for 05:00: two minutes after a start, connected
   * properties that have never completed an indexing run are refreshed one after the other.
   * Skipped in tests, and when a batch is already running.
   */
  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    if (this.collector.getDailyBudget() === 0) return;
    setTimeout(() => void this.catchUp(), 120_000).unref();
  }

  async catchUp(): Promise<void> {
    try {
      const done: { property_id: number }[] = await this.runs
        .createQueryBuilder('r')
        .select('DISTINCT r.property_id', 'property_id')
        .where("r.kind = 'indexing' AND r.status IN ('ok', 'partial')")
        .getRawMany();
      const seen = new Set(done.map((d) => Number(d.property_id)));
      const todo = (await this.properties.findByStatus('connected')).filter(
        (p) => !seen.has(p.id),
      );
      if (!todo.length || this.collector.batchStatus()) return;
      this.logger.log(
        `indexing catch-up: ${todo.length} properties never inspected`,
      );
      const r = await this.collector.refreshMany(todo);
      this.logger.log(
        `indexing catch-up: ${r.ok} ok, ${r.partial} partial, ${r.failed} failed`,
      );
    } catch (err) {
      this.logger.warn(`indexing catch-up: ${(err as Error).message}`);
    }
  }

  @Cron('0 5 * * *')
  async daily(): Promise<void> {
    if (this.collector.getDailyBudget() === 0) return;
    try {
      const r = await this.collector.refreshMany(
        await this.properties.findByStatus('connected'),
      );
      this.logger.log(
        `indexing daily: ${r.ok} ok, ${r.partial} partial, ${r.failed} failed, ${r.skipped} skipped`,
      );
    } catch (err) {
      this.logger.warn(`indexing daily: ${(err as Error).message}`);
    }
  }
}
