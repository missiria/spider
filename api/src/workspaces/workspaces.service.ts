import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Workspace } from './entities/workspace.entity';
import { currentWorkspaceId, requestContext } from './request-context';
import {
  Brand,
  LogoMeta,
  StoredLogo,
  inspectLogo,
  sanitizeBrand,
} from './brand';

export const DEFAULT_WORKSPACE_SLUG = 'missiria';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace) private readonly repo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  async ensureDefault(): Promise<Workspace> {
    const existing = await this.repo.findOne({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
    });
    if (existing) {
      return existing;
    }
    return this.repo.save(
      this.repo.create({ slug: DEFAULT_WORKSPACE_SLUG, name: 'MISSIRIA' }),
    );
  }

  create(slug: string, name: string): Promise<Workspace> {
    return this.repo.save(this.repo.create({ slug, name }));
  }

  all(): Promise<Workspace[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async get(id: number): Promise<Workspace> {
    const ws = await this.repo.findOne({ where: { id } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  // ---- membership --------------------------------------------------------

  /** The workspace a user belongs to (one membership in MVP-1), or null. */
  async workspaceIdFor(userId: number): Promise<number | null> {
    const m = await this.members.findOne({
      where: { user_id: userId },
      order: { id: 'ASC' },
    });
    return m?.workspace_id ?? null;
  }

  async addMember(workspaceId: number, userId: number): Promise<void> {
    const existing = await this.members.findOne({
      where: { workspace_id: workspaceId, user_id: userId },
    });
    if (existing) return;
    await this.members.save(
      this.members.create({ workspace_id: workspaceId, user_id: userId }),
    );
  }

  async isMember(workspaceId: number, userId: number): Promise<boolean> {
    return (
      (await this.members.count({
        where: { workspace_id: workspaceId, user_id: userId },
      })) > 0
    );
  }

  async memberIds(workspaceId: number): Promise<number[]> {
    const rows = await this.members.find({
      where: { workspace_id: workspaceId },
      select: { user_id: true },
    });
    return rows.map((r) => r.user_id);
  }

  // ---- tenant resolution -------------------------------------------------

  /**
   * The workspace of the current request (from the verified membership in the JWT
   * strategy) or of the `runAs()` scope a background job opened. Never a guess.
   */
  async current(): Promise<Workspace> {
    const id = this.currentId();
    return this.get(id);
  }

  currentId(): number {
    const id = currentWorkspaceId();
    if (id === null) {
      if (!requestContext.getStore()) {
        throw new InternalServerErrorException(
          'No workspace scope: background work must run inside WorkspacesService.runAs()',
        );
      }
      throw new ForbiddenException('No workspace for this account');
    }
    return id;
  }

  /** Run `fn` scoped to one workspace (schedulers iterate `all()` and call this per tenant). */
  runAs<T>(workspaceId: number, fn: () => Promise<T>): Promise<T> {
    return requestContext.run({ user: null, workspaceId }, fn);
  }

  // ---- brand -------------------------------------------------------------

  /** Replaces the brand profile of the current workspace (MISS-0094 fields + entity profile). */
  async updateBrand(input: Record<string, unknown>): Promise<Brand> {
    const ws = await this.current();
    const brand = sanitizeBrand(input);
    ws.brand = Object.keys(brand).length ? JSON.stringify(brand) : null;
    await this.repo.save(ws);
    return brand;
  }

  /** Stored logo of the current workspace (bytes included), or null. */
  async logo(): Promise<StoredLogo | null> {
    const row = await this.repo
      .createQueryBuilder('w')
      .select('w.id', 'id')
      .addSelect('w.brand_logo', 'brand_logo')
      .where('w.id = :id', { id: this.currentId() })
      .getRawOne<{ id: number; brand_logo: string | null }>();
    if (!row?.brand_logo) return null;
    try {
      return JSON.parse(row.brand_logo) as StoredLogo;
    } catch {
      return null;
    }
  }

  async logoMeta(): Promise<LogoMeta | null> {
    const l = await this.logo();
    return l
      ? { mime: l.mime, width: l.width, height: l.height, bytes: l.bytes }
      : null;
  }

  async setLogo(buf: Buffer): Promise<LogoMeta> {
    const meta = inspectLogo(buf);
    const stored: StoredLogo = { ...meta, data: buf.toString('base64') };
    await this.repo.update(
      { id: this.currentId() },
      { brand_logo: JSON.stringify(stored) },
    );
    return meta;
  }

  async removeLogo(): Promise<void> {
    await this.repo.update({ id: this.currentId() }, { brand_logo: null });
  }
}
