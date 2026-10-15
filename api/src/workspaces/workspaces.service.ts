import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity';

export const DEFAULT_WORKSPACE_SLUG = 'missiria';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace) private readonly repo: Repository<Workspace>,
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

  async updateBrand(input: {
    name?: string;
    accent_color?: string;
    footer?: string;
  }): Promise<Record<string, string>> {
    const ws = await this.current();
    const brand: Record<string, string> = {};
    if (input.name?.trim()) brand.name = input.name.trim().slice(0, 80);
    if (input.accent_color && /^#[0-9a-fA-F]{6}$/.test(input.accent_color))
      brand.accent_color = input.accent_color;
    if (input.footer?.trim()) brand.footer = input.footer.trim().slice(0, 160);
    ws.brand = Object.keys(brand).length ? JSON.stringify(brand) : null;
    await this.repo.save(ws);
    return brand;
  }

  /**
   * MVP-1 runs a single workspace. Sprint 1 (MISS-0089) scopes this per user.
   */
  async current(): Promise<Workspace> {
    const first = await this.repo.findOne({
      where: {},
      order: { id: 'ASC' },
    });
    return first ?? this.ensureDefault();
  }
}
