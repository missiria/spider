import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/jwt.strategy';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

/** Back end of /x-dashboard. Signup review stays on /signups (same operator rule). */
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Cheap probe the web layout uses to decide between the page and a 404. */
  @Get('whoami')
  whoami(@Req() req: { user: AuthUser }) {
    return { email: req.user.email, super_admin: true };
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('accounts')
  async accounts() {
    return { items: await this.admin.accounts() };
  }

  @Post('accounts/:id/deactivate')
  @HttpCode(204)
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    return this.admin.setActive(id, false, req.user.userId);
  }

  @Post('accounts/:id/reactivate')
  @HttpCode(204)
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    return this.admin.setActive(id, true, req.user.userId);
  }

  @Get('workspaces')
  async workspaces() {
    return { items: await this.admin.workspaceList() };
  }

  @Get('smtp')
  smtp() {
    return this.admin.smtp();
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('smtp/test')
  smtpTest(@Req() req: { user: AuthUser }) {
    return this.admin.smtpTest(req.user.userId);
  }
}
