import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/jwt.strategy';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SavedView, ViewScope } from './entities/saved-view.entity';

class CreateViewDto {
  @IsIn(['fleet', 'property'])
  scope: ViewScope;

  @IsOptional()
  @IsInt()
  property_id?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsObject()
  config: Record<string, unknown>;
}

class UpdateViewDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

const MAX_CONFIG_BYTES = 16_000;

@Controller('views')
export class ViewsController {
  constructor(
    @InjectRepository(SavedView) private readonly repo: Repository<SavedView>,
    private readonly workspaces: WorkspacesService,
  ) {}

  private present(v: SavedView) {
    return { ...v, config: safeParse(v.config) };
  }

  @Get()
  async list(
    @Query('scope') scope?: string,
    @Query('property_id') propertyId?: string,
  ) {
    const ws = await this.workspaces.current();
    const where: Partial<SavedView> = { workspace_id: ws.id };
    if (scope === 'fleet' || scope === 'property') where.scope = scope;
    if (propertyId) where.property_id = Number(propertyId);
    const items = await this.repo.find({ where, order: { name: 'ASC' } });
    return { items: items.map((v) => this.present(v)) };
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() body: CreateViewDto) {
    const ws = await this.workspaces.current();
    const config = JSON.stringify(body.config).slice(0, MAX_CONFIG_BYTES);
    const view = await this.repo.save(
      this.repo.create({
        workspace_id: ws.id,
        user_id: req.user.userId,
        scope: body.scope,
        property_id:
          body.scope === 'property' ? (body.property_id ?? null) : null,
        name: body.name.trim(),
        config,
      }),
    );
    return this.present(view);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateViewDto,
  ) {
    const view = await this.find(id);
    if (body.name !== undefined) view.name = body.name.trim();
    if (body.config !== undefined)
      view.config = JSON.stringify(body.config).slice(0, MAX_CONFIG_BYTES);
    return this.present(await this.repo.save(view));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const view = await this.find(id);
    await this.repo.remove(view);
  }

  private async find(id: number): Promise<SavedView> {
    const ws = await this.workspaces.current();
    const view = await this.repo.findOne({
      where: { id, workspace_id: ws.id },
    });
    if (!view) throw new NotFoundException('View not found');
    return view;
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
