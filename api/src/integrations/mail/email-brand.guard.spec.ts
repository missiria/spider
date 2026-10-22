import { ExecutionContext } from '@nestjs/common';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { EmailBrandGuard } from './email-brand.guard';

describe('email branding authorization', () => {
  const current = jest.fn();
  const guard = new EmailBrandGuard({
    current,
  } as unknown as WorkspacesService);
  const context = (role?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;
  beforeEach(() => jest.clearAllMocks());
  it('denies unauthenticated callers and ordinary members', async () => {
    await expect(guard.canActivate(context())).rejects.toThrow(
      'Super admin only',
    );
    await expect(guard.canActivate(context('member'))).rejects.toThrow(
      'Super admin only',
    );
    expect(current).not.toHaveBeenCalled();
  });
  it('denies tenant administrators', async () => {
    current.mockResolvedValue({ slug: 'customer' });
    await expect(guard.canActivate(context('admin'))).rejects.toThrow(
      'Super admin only',
    );
  });
  it('allows an administrator only in the operator workspace', async () => {
    current.mockResolvedValue({ slug: 'missiria' });
    await expect(guard.canActivate(context('admin'))).resolves.toBe(true);
  });
});
