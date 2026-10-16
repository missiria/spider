import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

/**
 * First boot: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD when the users
 * table is empty, and the default workspace when none exists (shark pattern).
 */
@Injectable()
export class DefaultAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultAdminSeeder.name);

  constructor(
    private readonly users: UsersService,
    private readonly workspaces: WorkspacesService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const workspace = await this.workspaces.ensureDefault();

    if ((await this.users.count()) > 0) {
      return;
    }
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'No users and ADMIN_EMAIL / ADMIN_PASSWORD not set: nobody can log in.',
      );
      return;
    }
    await this.users.create({
      email,
      password,
      name: 'Admin',
      role: 'admin',
      workspaceId: workspace.id,
    });
    this.logger.log(`Default admin created: ${email}`);
  }
}
