import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GscService } from '../gsc/gsc.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Property } from './entities/property.entity';

/**
 * Normalize user input to the exact siteUrl form GSC reports:
 *  - "example.com" / "https://example.com" / "https://www.example.com/path" → "https://www.example.com/"
 *  - "sc-domain:example.com" stays as is
 */
export function normalizeSiteUrl(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new BadRequestException('siteUrl is required');
  }
  if (raw.startsWith('sc-domain:')) {
    const host = raw.slice('sc-domain:'.length).trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
      throw new BadRequestException('Invalid domain property');
    }
    return `sc-domain:${host}`;
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BadRequestException('Invalid site URL');
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) {
    throw new BadRequestException('Invalid site URL');
  }
  return `${url.protocol}//${url.hostname.toLowerCase()}/`;
}

export function displayNameFor(siteUrl: string): string {
  return siteUrl
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectRepository(Property) private readonly repo: Repository<Property>,
    private readonly gsc: GscService,
    private readonly workspaces: WorkspacesService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<Property[]> {
    const ws = await this.workspaces.current();
    return this.repo.find({
      where: { workspace_id: ws.id },
      order: { display_name: 'ASC' },
    });
  }

  async get(id: number): Promise<Property> {
    const ws = await this.workspaces.current();
    const property = await this.repo.findOne({
      where: { id, workspace_id: ws.id },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }

  async create(input: string): Promise<Property> {
    const ws = await this.workspaces.current();
    const site_url = normalizeSiteUrl(input);
    const existing = await this.repo.findOne({
      where: { workspace_id: ws.id, site_url },
    });
    if (existing) {
      throw new ConflictException('Property already added');
    }
    return this.repo.save(
      this.repo.create({
        workspace_id: ws.id,
        site_url,
        display_name: displayNameFor(site_url),
        status: 'pending',
      }),
    );
  }

  /**
   * Deletes the property and everything derived from it: daily + dimension rows, sync runs
   * and opportunities cascade through foreign keys; saved views are cleaned up here.
   */
  async remove(id: number): Promise<void> {
    const property = await this.get(id);
    await this.dataSource.query('DELETE FROM saved_views WHERE property_id = ?', [property.id]);
    await this.repo.remove(property);
  }

  /**
   * The "checker" (ADR-0002): is the property visible to the service account?
   * Returns the updated property and whether it just became connected.
   */
  async checkAccess(
    property: Property,
  ): Promise<{ property: Property; justConnected: boolean }> {
    let sites: string[];
    try {
      sites = (await this.gsc.listSites()).map((s) => s.siteUrl);
    } catch (err) {
      property.last_checked_at = new Date();
      property.last_error = `Access check failed: ${(err as Error).message}`;
      await this.repo.save(property);
      throw err;
    }

    const visible = sites.includes(property.site_url);
    const wasConnected = property.status === 'connected';
    property.last_checked_at = new Date();

    if (visible) {
      if (!wasConnected) {
        property.connected_at = new Date();
      }
      property.status = 'connected';
      property.last_error = null;
    } else if (wasConnected) {
      property.status = 'revoked';
      property.last_error =
        'The service account no longer sees this property in Search Console.';
    } else {
      property.status = 'pending';
      property.last_error = null;
    }

    const saved = await this.repo.save(property);
    const justConnected = visible && !wasConnected;
    if (justConnected) {
      this.logger.log(`Property connected: ${saved.site_url}`);
    }
    return { property: saved, justConnected };
  }

  async findByStatus(status: Property['status']): Promise<Property[]> {
    return this.repo.find({ where: { status } });
  }

  async save(property: Property): Promise<Property> {
    return this.repo.save(property);
  }
}
