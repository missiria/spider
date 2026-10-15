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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  Allow,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { AuthUser } from '../auth/jwt.strategy';
import { ScheduleFrequency } from './entities/report-schedule.entity';
import { ReportsService } from './reports.service';

class CreateReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(['fleet', 'property'])
  scope: 'fleet' | 'property';

  @IsOptional()
  @IsInt()
  property_id?: number;

  @IsObject()
  config: Record<string, unknown>;
}

class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

class CreateScheduleDto {
  @IsIn(['weekly', 'monthly'])
  frequency: ScheduleFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  // string or string[]; parsed by parseRecipients
  @Allow()
  recipients: unknown;
}

class UpdateScheduleDto {
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  frequency?: ScheduleFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @Allow()
  recipients?: unknown;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list() {
    return this.reports.list();
  }

  @Post()
  create(@Req() req: { user: AuthUser }, @Body() body: CreateReportDto) {
    return this.reports.create(req.user.userId, body);
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const r = await this.reports.find(id);
    return this.reports.present(r);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateReportDto) {
    return this.reports.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.reports.remove(id);
  }

  /** JSON export for automation tools (same shape the PDF and CSV are built from). */
  @Get(':id/data')
  data(@Param('id', ParseIntPipe) id: number) {
    return this.reports.data(id);
  }

  @Get(':id/export.csv')
  async csv(
    @Param('id', ParseIntPipe) id: number,
    @Query('section') section: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reports.data(id);
    const out = this.reports.csv(
      data,
      section ??
        (data.overview ? 'overview' : (data.tables[0]?.section ?? 'overview')),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.content);
  }

  @Get(':id/export.pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const data = await this.reports.data(id);
    const out = await this.reports.pdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.buffer);
  }

  @Post(':id/schedules')
  createSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateScheduleDto,
  ) {
    return this.reports.createSchedule(id, body);
  }

  @Patch('schedules/:sid')
  updateSchedule(
    @Param('sid', ParseIntPipe) sid: number,
    @Body() body: UpdateScheduleDto,
  ) {
    return this.reports.updateSchedule(sid, body);
  }

  @Delete('schedules/:sid')
  @HttpCode(204)
  async removeSchedule(@Param('sid', ParseIntPipe) sid: number) {
    await this.reports.removeSchedule(sid);
  }

  @Get('schedules/:sid/deliveries')
  deliveries(@Param('sid', ParseIntPipe) sid: number) {
    return this.reports.scheduleDeliveries(sid);
  }

  @Post('schedules/:sid/send')
  @HttpCode(200)
  sendNow(@Param('sid', ParseIntPipe) sid: number) {
    return this.reports.sendNow(sid);
  }
}
