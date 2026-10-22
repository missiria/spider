import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscService } from '../gsc/gsc.service';
import { parseCoverage } from '../sync/coverage';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  MAX_LOGO_BYTES,
  missingBranding,
  parseBrand,
} from '../workspaces/brand';

/** Shape and length only; sanitizeBrand() normalises and validates the values. */
class BrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  accent_color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  footer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legal_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trading_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  registered_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

/** Reads a raw request body up to `max` bytes (the global parsers only handle JSON/forms). */
function readRaw(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (c: Buffer) => {
      if (failed) return;
      size += c.length;
      if (size > max) {
        failed = true;
        reject(
          new BadRequestException(
            `The logo is larger than ${MAX_LOGO_BYTES / 1024} KB`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

  /** Report branding: display brand + legal entity profile (PDF header / footer). Admin only. */
  @Roles('admin')
  @Put('brand')
  brand(@Body() body: BrandDto) {
    return this.workspaces.updateBrand({ ...body });
  }

  /**
   * Approved logo, sent as the raw image body (Content-Type image/png or image/jpeg). The
   * type is checked from the bytes; the response never contains a path, only the metadata.
   */
  @Roles('admin')
  @Put('brand/logo')
  async putLogo(@Req() req: Request) {
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (type !== 'image/png' && type !== 'image/jpeg')
      throw new BadRequestException('The logo must be a PNG or JPEG image');
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_LOGO_BYTES)
      throw new BadRequestException(
        `The logo is larger than ${MAX_LOGO_BYTES / 1024} KB`,
      );
    return this.workspaces.setLogo(await readRaw(req, MAX_LOGO_BYTES));
  }

  @Roles('admin')
  @Delete('brand/logo')
  @HttpCode(204)
  async deleteLogo() {
    await this.workspaces.removeLogo();
  }

  /** The current workspace's logo image (for the Settings preview). */
  @Get('brand/logo')
  async getLogo(@Res() res: Response) {
    const logo = await this.workspaces.logo();
    if (!logo) throw new NotFoundException('No logo configured');
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(logo.data, 'base64'));
  }

  @Get()
  async get() {
    const workspace = await this.workspaces.current();
    const brand = parseBrand(workspace.brand);
    const logo = await this.workspaces.logoMeta();
    return {
      brand,
      logo,
      branding_missing: missingBranding(brand, !!logo),
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
