import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Assignee picker: every active user, public shape only. */
  @Get()
  async list() {
    const items = await this.users.listActive();
    return { items: items.map((u) => this.users.toPublic(u)) };
  }
}
