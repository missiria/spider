import { Controller, Get } from '@nestjs/common';
import { GscService } from '../gsc/gsc.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly gsc: GscService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  async get() {
    const workspace = await this.workspaces.current();
    return {
      workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
      serviceAccountEmail: this.gsc.getServiceAccountEmail(),
      mock: this.gsc.isMock(),
      schedule: {
        accessCheck: 'every 10 minutes for pending properties',
        incrementalSync: 'daily at 06:10 server time, last 10 days re-synced',
      },
    };
  }
}
