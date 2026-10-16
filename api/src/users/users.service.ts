import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly workspaces: WorkspacesService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  /** Active members of the current workspace (assignee picker, System page). */
  async listActive(): Promise<User[]> {
    const ids = await this.workspaces.memberIds(this.workspaces.currentId());
    if (!ids.length) return [];
    return this.repo.find({
      where: { id: In(ids), is_active: true },
      order: { name: 'ASC' },
    });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** A user of the current workspace, 404 otherwise (ids from other tenants look absent). */
  async findMember(id: number): Promise<User> {
    const user = await this.findById(id);
    if (
      !user ||
      !(await this.workspaces.isMember(this.workspaces.currentId(), user.id))
    ) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(
    id: number,
    input: { name?: string; email?: string },
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (email !== user.email) {
        const taken = await this.repo.findOne({ where: { email } });
        if (taken) {
          throw new ConflictException('Email already in use');
        }
        user.email = email;
      }
    }
    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    return this.repo.save(user);
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
    };
  }

  /** Creates the account and its membership. Without `workspaceId` the current scope is used. */
  async create(input: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    workspaceId?: number;
  }): Promise<User> {
    const user = await this.repo.save(
      this.repo.create({
        email: input.email.trim().toLowerCase(),
        password_hash: await bcrypt.hash(input.password, 10),
        name: input.name,
        role: input.role ?? 'admin',
        is_active: true,
      }),
    );
    await this.workspaces.addMember(
      input.workspaceId ?? this.workspaces.currentId(),
      user.id,
    );
    return user;
  }

  /** Invite into the inviting admin's workspace; the one-time password is returned once. */
  async invite(input: {
    email: string;
    name: string;
    role?: UserRole;
  }): Promise<{ user: User; password: string }> {
    const email = input.email.trim().toLowerCase();
    // 18 random bytes → 24 url-safe chars; shown once to the inviting admin
    const password = randomBytes(18).toString('base64url');
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) {
      // re-inviting a deactivated member of this workspace = password reset + reactivation
      const sameWorkspace = await this.workspaces.isMember(
        this.workspaces.currentId(),
        existing.id,
      );
      if (existing.is_active || !sameWorkspace) {
        throw new ConflictException('Email already in use');
      }
      existing.is_active = true;
      existing.name = input.name;
      existing.role = input.role ?? existing.role;
      existing.password_hash = await bcrypt.hash(password, 10);
      existing.token_version += 1;
      return { user: await this.repo.save(existing), password };
    }
    const user = await this.create({
      email,
      name: input.name,
      password,
      role: input.role ?? 'member',
    });
    return { user, password };
  }

  /** Deactivation also revokes every session: the next request with an old token is 401. */
  async deactivate(id: number, actingUserId: number): Promise<void> {
    if (id === actingUserId) {
      throw new ConflictException('You cannot deactivate your own account');
    }
    const user = await this.findMember(id);
    user.is_active = false;
    user.token_version += 1;
    await this.repo.save(user);
  }

  /** Invalidate every JWT issued so far for this user (ADR-0007). */
  async revokeSessions(user: User): Promise<void> {
    user.token_version += 1;
    await this.repo.save(user);
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }
}
