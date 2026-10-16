import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Roles } from '../auth/roles.guard';
import { AlertsService } from './alerts.service';
import { WebhooksService } from './webhooks.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

class CreateWebhookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(2048)
  url: string;

  @IsArray()
  events: string[];
}

class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsArray()
  events?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class CreateAlertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(['email', 'webhook'])
  channel: 'email' | 'webhook';

  @Allow()
  target: unknown;

  @IsOptional()
  @Allow()
  config?: unknown;
}

class UpdateAlertDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['email', 'webhook'])
  channel?: 'email' | 'webhook';

  @IsOptional()
  @Allow()
  target?: unknown;

  @IsOptional()
  @Allow()
  config?: unknown;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  list() {
    return this.webhooks.list();
  }

  @Roles('admin')
  @Post()
  create(@Body() body: CreateWebhookDto) {
    return this.webhooks.create(body);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateWebhookDto,
  ) {
    return this.webhooks.update(id, body);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.webhooks.remove(id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id', ParseIntPipe) id: number) {
    return this.webhooks.recentDeliveries(id);
  }

  /** Deliver pending webhook payloads now (otherwise every 5 minutes). */
  @Roles('admin')
  @Post('process')
  @HttpCode(200)
  process() {
    return this.webhooks.processPending(50, this.workspaces.currentId());
  }

  @Roles('admin')
  @Post(':id/test')
  @HttpCode(200)
  test(@Param('id', ParseIntPipe) id: number) {
    return this.webhooks.test(id);
  }
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list() {
    return this.alerts.list();
  }

  @Post()
  create(@Body() body: CreateAlertDto) {
    return this.alerts.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateAlertDto) {
    return this.alerts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.alerts.remove(id);
  }

  /** Evaluate now (otherwise hourly + after each scan). */
  @Post('evaluate')
  @HttpCode(200)
  evaluate() {
    return this.alerts.evaluate();
  }
}
