import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.guard';
import { UsersService } from './users.service';

class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Assignee picker: every active user, public shape only. */
  @Get()
  async list() {
    const items = await this.users.listActive();
    return { items: items.map((u) => this.users.toPublic(u)) };
  }

  /**
   * Invite-only beta: an admin creates the account; the generated password is returned
   * once in this response and never stored in clear. Hand it over out of band.
   */
  @Roles('admin')
  @Post()
  async invite(@Body() body: InviteUserDto) {
    const { user, password } = await this.users.invite(body);
    return { user: this.users.toPublic(user), temporary_password: password };
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  async deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    await this.users.deactivate(id, req.user.userId);
  }

  /** Sign a member out everywhere (lost device, shared password): old tokens become 401. */
  @Roles('admin')
  @Post(':id/revoke-sessions')
  @HttpCode(204)
  async revokeSessions(@Param('id', ParseIntPipe) id: number) {
    await this.users.revokeSessions(await this.users.findMember(id));
  }
}
