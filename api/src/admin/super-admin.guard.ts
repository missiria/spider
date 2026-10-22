import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from '../auth/jwt.strategy';
import {
  DEFAULT_WORKSPACE_SLUG,
  WorkspacesService,
} from '../workspaces/workspaces.service';

/**
 * Super admin = an admin of the operator workspace (slug `missiria`), the same people who
 * review signups. Runs after the global AuthGuard, so `req.user` and the tenant scope are the
 * verified ones from the JWT strategy; the workspace is re-read, never taken from the client.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Super admin only');
    }
    const ws = await this.workspaces.current();
    if (ws.slug !== DEFAULT_WORKSPACE_SLUG) {
      throw new ForbiddenException('Super admin only');
    }
    return true;
  }
}
