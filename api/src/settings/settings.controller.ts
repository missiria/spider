import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Roles } from '../auth/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscService } from '../gsc/gsc.service';
import { parseCoverage } from '../sync/coverage';
import { WorkspacesService } from '../workspaces/workspaces.service';

class BrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accent_color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  footer?: string;
}

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly gsc: GscService,
    private readonly workspaces: WorkspacesService,
    @InjectRepository(Property)
    private readonly properties: Repository<Property>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
  ) {}

  /**
   * Operational view of the current workspace: what failed, what is stale, what is only
   * partially covered. Used by the smoke test and the System page. "Fresh" (last_sync_at)
   * and "complete" (coverage) are reported separately on purpose.
   */
  @Get('health')
  async health() {
    const workspaceId = this.workspaces.currentId();
    const props = await this.properties.find({
      where: { workspace_id: workspaceId },
    });
    const ids = props.map((p) => p.id);
    const staleBefore = new Date(Date.now() - 36 * 3_600_000);
    const problemRuns = ids.length
      ? await this.runs.find({
          where: { property_id: In(ids), status: In(['failed', 'partial']) },
          order: { started_at: 'DESC' },
          take: 20,
        })
      : [];
    const failedRuns = problemRuns.filter((r) => r.status === 'failed');
    const connected = props.filter((p) => p.status === 'connected');
    const partial = props
      .filter((p) => p.last_sync_status === 'partial')
      .map((p) => ({
        id: p.id,
        site_url: p.site_url,
        last_sync_at: p.last_sync_at,
        coverage: parseCoverage(p.coverage),
      }));
    return {
      properties: {
        total: props.length,
        connected: connected.length,
        pending: props.filter((p) => p.status === 'pending').length,
        revoked: props.filter((p) => p.status === 'revoked').length,
        error: props.filter((p) => p.status === 'error').length,
        with_errors: props
          .filter((p) => p.last_error)
          .map((p) => ({
            id: p.id,
            site_url: p.site_url,
            status: p.status,
            last_error: p.last_error,
          })),
        stale: connected
          .filter((p) => !p.last_sync_at || p.last_sync_at < staleBefore)
          .map((p) => ({
            id: p.id,
            site_url: p.site_url,
            last_sync_at: p.last_sync_at,
          })),
        partial,
      },
      failed_runs: failedRuns.map((r) => ({
        id: r.id,
        property_id: r.property_id,
        kind: r.kind,
        started_at: r.started_at,
        error: r.error,
      })),
      partial_runs: problemRuns
        .filter((r) => r.status === 'partial')
        .map((r) => ({
          id: r.id,
          property_id: r.property_id,
          kind: r.kind,
          started_at: r.started_at,
          error: r.error,
        })),
      mock: this.gsc.isMock(),
      ok:
        failedRuns.filter((r) => r.started_at > staleBefore).length === 0 &&
        connected.every((p) => p.last_sync_at && p.last_sync_at >= staleBefore),
      /** true only when fresh AND every connected property's last run was complete */
      complete: partial.length === 0,
    };
  }

  /** Report branding (PDF header / accent / footer). Admin only. */
  @Roles('admin')
  @Put('brand')
  brand(@Body() body: BrandDto) {
    return this.workspaces.updateBrand(body);
  }

  @Get()
  async get() {
    const workspace = await this.workspaces.current();
    let brand: Record<string, string> = {};
    try {
      brand = workspace.brand
        ? (JSON.parse(workspace.brand) as Record<string, string>)
        : {};
    } catch {
      brand = {};
    }
    return {
      brand,
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      },
      serviceAccountEmail: this.gsc.getServiceAccountEmail(),
      mock: this.gsc.isMock(),
      schedule: {
        accessCheck: 'every 10 minutes for pending properties',
        incrementalSync: 'daily at 06:10 server time, last 10 days re-synced',
      },
    };
  }
}
