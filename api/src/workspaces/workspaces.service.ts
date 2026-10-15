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
