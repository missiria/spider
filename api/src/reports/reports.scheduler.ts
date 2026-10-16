import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from '../integrations/alerts.service';
import { WebhooksService } from '../integrations/webhooks.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ReportsService } from './reports.service';

/**
 * Hourly worker: due report schedules, alert evaluation, webhook retries.
 * Each step is idempotent (unique keys) so a restart or overlap never double-sends.
 * Alerts are evaluated per workspace; schedules scope themselves; webhook deliveries
 * already carry their endpoint.
 */
@Injectable()
export class ReportsScheduler {
  private readonly logger = new Logger(ReportsScheduler.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly alerts: AlertsService,
    private readonly webhooks: WebhooksService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Cron('5 * * * *')
  async hourly(): Promise<void> {
    try {
      const r = await this.reports.runDueSchedules();
      if (r.due) this.logger.log(`report schedules: ${JSON.stringify(r)}`);
    } catch (err) {
      this.logger.warn(`report schedules: ${(err as Error).message}`);
    }
    for (const ws of await this.workspaces.all()) {
      try {
        const a = await this.workspaces.runAs(ws.id, () =>
          this.alerts.evaluate(),
        );
        if (a.rules)
          this.logger.log(`alerts (${ws.slug}): ${JSON.stringify(a)}`);
      } catch (err) {
        this.logger.warn(`alerts (${ws.slug}): ${(err as Error).message}`);
      }
    }
    try {
      const w = await this.webhooks.processPending();
      if (w.attempted) this.logger.log(`webhooks: ${JSON.stringify(w)}`);
    } catch (err) {
      this.logger.warn(`webhooks: ${(err as Error).message}`);
    }
  }

  /** Webhook retries also run every 5 minutes so first attempts are quick. */
  @Cron('*/5 * * * *')
  async webhookRetries(): Promise<void> {
    try {
      await this.webhooks.processPending();
    } catch (err) {
      this.logger.warn(`webhook retries: ${(err as Error).message}`);
    }
  }
}
