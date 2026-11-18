import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUser } from '../auth/jwt.strategy';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { PropertiesService } from '../properties/properties.service';
import { IndexingCollectorService } from './indexing-collector.service';
import { IndexingService } from './indexing.service';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

class InspectDto {
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_protocol: true, require_tld: false })
  url: string;
}

/** Reads the raw upload (ZIP or CSV) up to `max` bytes. */
function readRaw(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (c: Buffer) => {
      if (failed) return;
      size += c.length;
      if (size > max) {
        failed = true;
        reject(
          new BadRequestException(
            `The file is larger than ${max / 1024 / 1024} MB`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Page indexing (MITP-0833, ADR-0009). Report-wide numbers come from uploaded Search Console
 * exports; URL-level facts come from the URL Inspection API. Responses say which.
 */
@Controller()
export class IndexingController {
  constructor(
    private readonly indexing: IndexingService,
    private readonly collector: IndexingCollectorService,
    private readonly properties: PropertiesService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Lazy lookup: OpportunitiesModule imports IndexingModule, so no constructor injection. */
  private opportunities(): OpportunitiesService {
    return this.moduleRef.get(OpportunitiesService, { strict: false });
  }

  @Get('indexing/overview')
  fleet() {
    return this.indexing.fleet();
  }

  @Get('properties/:id/indexing')
  property(
    @Param('id', ParseIntPipe) id: number,
    @Query('scope') scope?: string,
    @Query('sitemap') sitemap?: string,
  ) {
    return this.indexing.propertyIndexing(id, scope, sitemap);
  }

  @Get('properties/:id/indexing/reasons/:hash')
  reason(
    @Param('id', ParseIntPipe) id: number,
    @Param('hash') hash: string,
    @Query('scope') scope?: string,
    @Query('sitemap') sitemap?: string,
  ) {
    if (!/^[a-f0-9]{32}$/.test(hash))
      throw new BadRequestException('Bad reason id');
    return this.indexing.reasonDetail(id, hash, scope, sitemap);
  }

  /** Upload a Search Console Page indexing export (ZIP from "Download CSV", or one CSV). */
  @Post('properties/:id/indexing/imports')
  async upload(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: AuthUser },
    @Query('filename') filename?: string,
  ) {
    const buf = await readRaw(req, MAX_IMPORT_BYTES);
    if (!buf.length) throw new BadRequestException('Empty upload');
    const result = await this.indexing.importExport(
      id,
      buf,
      (filename || 'export.zip').replace(/[^\w.\- ()]/g, '_'),
      req.user?.userId ?? null,
    );
    // findings from the new report appear right away (the daily scan still runs at 07:30)
    const scan = await this.opportunities()
      .scanProperty(id)
      .catch(() => null);
    return { ...result, opportunities: scan };
  }

  @Delete('properties/:id/indexing/imports/:importId')
  @HttpCode(204)
  async removeImport(
    @Param('id', ParseIntPipe) id: number,
    @Param('importId', ParseIntPipe) importId: number,
  ) {
    await this.indexing.deleteImport(id, importId);
  }

  @Get('properties/:id/indexing/urls')
  urls(
    @Param('id', ParseIntPipe) id: number,
    @Query('coverage') coverage?: string,
    @Query('verdict') verdict?: string,
    @Query('in_sitemap') in_sitemap?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.indexing.urls(id, {
      coverage,
      verdict,
      in_sitemap,
      search,
      page: page ? Number.parseInt(page, 10) : 1,
    });
  }

  @Get('properties/:id/indexing/urls/:hash')
  url(@Param('id', ParseIntPipe) id: number, @Param('hash') hash: string) {
    if (!/^[a-f0-9]{32}$/.test(hash))
      throw new BadRequestException('Bad URL id');
    return this.indexing.urlDetail(id, hash);
  }

  @Post('properties/:id/indexing/urls/:hash/live-check')
  @HttpCode(200)
  live(@Param('id', ParseIntPipe) id: number, @Param('hash') hash: string) {
    if (!/^[a-f0-9]{32}$/.test(hash))
      throw new BadRequestException('Bad URL id');
    return this.indexing.liveCheck(id, hash);
  }

  /** Inspect one URL now (counts against the property's daily URL Inspection quota). */
  @Post('properties/:id/indexing/inspect')
  @HttpCode(200)
  inspect(@Param('id', ParseIntPipe) id: number, @Body() body: InspectDto) {
    return this.indexing.inspectNow(id, body.url);
  }

  /** Sitemaps snapshot + inventory + up to the daily budget of inspections, in the background. */
  @Post('properties/:id/indexing/refresh')
  @HttpCode(202)
  async refresh(@Param('id', ParseIntPipe) id: number) {
    const property = await this.properties.get(id);
    if (property.status !== 'connected') {
      throw new BadRequestException(
        'The property is not connected to Search Console',
      );
    }
    if (this.collector.isRunning(id)) {
      throw new ConflictException('An indexing refresh is already running');
    }
    void this.collector
      .refresh(property)
      .then(() => this.opportunities().scanProperty(id))
      .catch(() => undefined);
    return { started: true };
  }
}
