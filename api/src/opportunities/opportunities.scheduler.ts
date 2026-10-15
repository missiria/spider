import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OpportunitiesService } from './opportunities.service';

/** Daily scan after the 06:10 incremental sync has had time to finish. */
@Injectable()
export class OpportunitiesScheduler {
  private readonly logger = new Logger(OpportunitiesScheduler.name);

  constructor(private readonly opportunities: OpportunitiesService) {}

  @Cron('30 7 * * *')
  async dailyScan(): Promise<void> {
    try {
      await this.opportunities.scan();
    } catch (err) {
      this.logger.warn(`daily scan: ${(err as Error).message}`);
    }
  }
}
