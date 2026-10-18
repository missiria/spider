import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Roles } from './roles.guard';
import { SignupService } from './signup.service';

/** Operator review of self-service signups (admins of the default workspace). */
@Controller('signups')
export class SignupsController {
  constructor(private readonly signup: SignupService) {}

  @Roles('admin')
  @Get()
  async list() {
    return { items: await this.signup.listPending() };
  }

  @Roles('admin')
  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.signup.approve(id);
  }

  @Roles('admin')
  @Post(':id/reject')
  @HttpCode(204)
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.signup.reject(id);
  }
}
