import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { GscService } from '../gsc/gsc.service';
import { OverviewService } from '../overview/overview.service';
import { SyncService } from '../sync/sync.service';
import { PropertiesService } from './properties.service';

class CreatePropertyDto {
  @IsString()
  @MinLength(3)
  siteUrl: string;
}

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly sync: SyncService,
    private readonly gsc: GscService,
    private readonly overview: OverviewService,
  ) {}

  @Get()
  async list() {
    const items = await this.properties.list();
    const withRuns = await Promise.all(
      items.map(async (p) => ({
        ...p,
        syncing: this.sync.isRunning(p.id),
        last_run: await this.sync.latestRun(p.id),
      })),
    );
    return { serviceAccountEmail: this.gsc.getServiceAccountEmail(), items: withRuns };
  }

  @Post()
  async create(@Body() body: CreatePropertyDto) {
    const property = await this.properties.create(body.siteUrl);
    return { property, serviceAccountEmail: this.gsc.getServiceAccountEmail() };
  }

  @Get(':id')
  async detail(
    @Param('id', ParseIntPipe) id: number,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const property = await this.properties.get(id);
    const detail = await this.overview.propertyDetail(property, { start, end });
    return {
      property: {
        ...property,
        syncing: this.sync.isRunning(property.id),
        last_run: await this.sync.latestRun(property.id),
      },
      ...detail,
    };
  }

  @Post(':id/check')
  @HttpCode(200)
  async check(@Param('id', ParseIntPipe) id: number) {
    const property = await this.properties.get(id);
    const { property: updated, justConnected } =
      await this.properties.checkAccess(property);
    if (justConnected) {
      // fire and forget: the UI polls the property for sync status
      this.sync.backfill(updated).catch(() => undefined);
    }
    return { property: updated, justConnected };
  }

  @Post(':id/sync')
  @HttpCode(202)
  async resync(@Param('id', ParseIntPipe) id: number) {
    const property = await this.properties.get(id);
    if (property.status !== 'connected') {
      return { started: false, reason: `Property is ${property.status}` };
    }
    if (this.sync.isRunning(property.id)) {
      return { started: false, reason: 'A sync is already running' };
    }
    const kind = property.data_since ? 'incremental' : 'backfill';
    (kind === 'backfill' ? this.sync.backfill(property) : this.sync.incremental(property)).catch(
      () => undefined,
    );
    return { started: true, kind };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.properties.remove(id);
  }
}
