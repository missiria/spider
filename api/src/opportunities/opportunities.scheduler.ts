import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DIGEST_TIME_ZONE } from './digest';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityDigestService } from './opportunity-digest.service';

/** Daily scan after the 06:10 incremental sync has had time to finish, one workspace at a time. */
@Injectable()
export class OpportunitiesScheduler {
  private readonly logger = new Logger(OpportunitiesScheduler.name);

  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly workspaces: WorkspacesService,
    private readonly digest: OpportunityDigestService,
  ) {}

  @Cron('30 7 * * *')
  async dailyScan(): Promise<void> {
    for (const ws of await this.workspaces.all()) {
      try {
        await this.workspaces.runAs(ws.id, () => this.opportunities.scan());
      } catch (err) {
        this.logger.warn(
          `daily scan (workspace ${ws.slug}): ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Weekly opportunities email (MISS-0196): Monday 08:00 Paris, after the Monday scan. The
   * zone is explicit because the other crons follow the server clock. Each (admin, workspace,
   * ISO week) is claimed before sending, so a rerun or a restart never sends twice.
   */
  @Cron('0 8 * * 1', {
    name: 'opportunity-weekly-digest',
    timeZone: DIGEST_TIME_ZONE,
  })
  async weeklyDigest(): Promise<void> {
    try {
      const r = await this.digest.runWeekly();
      this.logger.log(`weekly digest: ${JSON.stringify(r)}`);
    } catch (err) {
      this.logger.warn(`weekly digest: ${(err as Error).message}`);
    }
  }
}
