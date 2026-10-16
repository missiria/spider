import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Per-request store (ADR-0007). The middleware opens a store for every HTTP request;
 * JwtStrategy fills `user` once the token and membership are verified. Services resolve
 * the tenant from here, so a forgotten parameter cannot leak another workspace: without a
 * store (background jobs) `WorkspacesService.current()` refuses to guess and the job must
 * use `runAs(workspaceId, …)`.
 */
export interface RequestStore {
  user: AuthUser | null;
  /** set by runAs() for background work on behalf of one workspace */
  workspaceId?: number;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function requestContextMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  requestContext.run({ user: null }, () => next());
}

export function currentUser(): AuthUser | null {
  return requestContext.getStore()?.user ?? null;
}

export function currentWorkspaceId(): number | null {
  const store = requestContext.getStore();
  if (!store) return null;
  return store.user?.workspaceId ?? store.workspaceId ?? null;
}
