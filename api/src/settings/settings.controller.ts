import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscService } from '../gsc/gsc.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly gsc: GscService,
    private readonly workspaces: WorkspacesService,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
  ) {}

  /** Operational view: what failed, what is stale. Used by the smoke test and the settings page. */
  @Get('health')
  async health() {
    const props = await this.properties.find();
    const staleBefore = new Date(Date.now() - 36 * 3_600_000);
    const failedRuns = await this.runs.find({ where: { status: 'failed' }, order: { started_at: 'DESC' }, take: 20 });
    const connected = props.filter((p) => p.status === 'connected');
    return {
      properties: {
        total: props.length,
        connected: connected.length,
        pending: props.filter((p) => p.status === 'pending').length,
        revoked: props.filter((p) => p.status === 'revoked').length,
        error: props.filter((p) => p.status === 'error').length,
        with_errors: props.filter((p) => p.last_error).map((p) => ({ id: p.id, site_url: p.site_url, status: p.status, last_error: p.last_error })),
        stale: connected.filter((p) => !p.last_sync_at || p.last_sync_at < staleBefore).map((p) => ({ id: p.id, site_url: p.site_url, last_sync_at: p.last_sync_at })),
      },
      failed_runs: failedRuns.map((r) => ({ id: r.id, property_id: r.property_id, kind: r.kind, started_at: r.started_at, error: r.error })),
      mock: this.gsc.isMock(),
      ok: failedRuns.filter((r) => r.started_at > staleBefore).length === 0 && connected.every((p) => p.last_sync_at && p.last_sync_at >= staleBefore),
    };
  }

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
