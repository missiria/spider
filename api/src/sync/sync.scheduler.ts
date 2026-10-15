import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PropertiesService } from '../properties/properties.service';
import { SyncService } from './sync.service';

/**
 * Background jobs (ADR-0002 / PLAN §4):
 *  - every 10 min: re-check PENDING properties, backfill the ones that became visible
 *  - daily 06:10: incremental sync of every CONNECTED property, and re-check access
 */
@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly properties: PropertiesService,
    private readonly sync: SyncService,
  ) {}

  @Cron('*/10 * * * *')
  async checkPending(): Promise<void> {
    const pending = await this.properties.findByStatus('pending');
    for (const property of pending) {
      try {
        const { property: updated, justConnected } =
          await this.properties.checkAccess(property);
        if (justConnected) {
          await this.sync.backfill(updated);
        }
      } catch (err) {
        this.logger.warn(`check ${property.site_url}: ${(err as Error).message}`);
      }
    }
  }

  @Cron('10 6 * * *')
  async dailyIncremental(): Promise<void> {
    const connected = await this.properties.findByStatus('connected');
    for (const property of connected) {
      try {
        const { property: updated } = await this.properties.checkAccess(property);
        if (updated.status === 'connected') {
          await this.sync.incremental(updated);
        }
      } catch (err) {
        this.logger.warn(`daily ${property.site_url}: ${(err as Error).message}`);
      }
    }
  }
}
