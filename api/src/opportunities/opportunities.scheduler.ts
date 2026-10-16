import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { OpportunitiesService } from './opportunities.service';

/** Daily scan after the 06:10 incremental sync has had time to finish, one workspace at a time. */
@Injectable()
export class OpportunitiesScheduler {
  private readonly logger = new Logger(OpportunitiesScheduler.name);

  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly workspaces: WorkspacesService,
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
}
