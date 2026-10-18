import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { requestContext } from '../workspaces/request-context';
import { WorkspacesService } from '../workspaces/workspaces.service';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  /** users.token_version at issue time; a bump revokes the token (ADR-0007) */
  ver: number;
}

export interface AuthUser {
  userId: number;
  email: string;
  role: string;
  workspaceId: number;
}

export const SESSION_COOKIE = 'spider_session';

/** Read the httpOnly session cookie set by the web app (no JS access to the token). */
export function tokenFromCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * A signature alone is not a session: every request re-reads the user row, so a
 * deactivated or deleted account, a bumped token_version (sessions revoked) or a changed
 * role takes effect immediately. Authorization state always comes from the database.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly users: UsersService,
    private readonly workspaces: WorkspacesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        tokenFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'default_dev_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(Number(payload.sub));
    if (!user || !user.is_active || user.approval_status !== 'approved') {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if ((payload.ver ?? 0) !== user.token_version) {
      throw new UnauthorizedException('Session was revoked, sign in again');
    }
    const workspaceId = await this.workspaces.workspaceIdFor(user.id);
    if (workspaceId === null) {
      throw new ForbiddenException('No workspace for this account');
    }
    const authUser: AuthUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      workspaceId,
    };
    const store = requestContext.getStore();
    if (store) store.user = authUser;
    return authUser;
  }
}
