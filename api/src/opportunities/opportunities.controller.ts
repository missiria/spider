import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AuthUser } from '../auth/jwt.strategy';
import { parseUrlPageSize } from '../indexing/url-page-size';
import { Roles } from '../auth/roles.guard';
import {
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STATUSES,
  OpportunityPriority,
  OpportunityStatus,
} from './entities/opportunity.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityDigestService } from './opportunity-digest.service';

class UpdateOpportunityDto {
  @IsOptional()
  @IsIn(OPPORTUNITY_STATUSES as unknown as string[])
  status?: OpportunityStatus;

  @IsOptional()
  @IsIn(OPPORTUNITY_PRIORITIES as unknown as string[])
  priority?: OpportunityPriority;

  @IsOptional()
  @ValidateIf((o) => o.assignee_id !== null)
  @IsInt()
  assignee_id?: number | null;

  @IsOptional()
  @ValidateIf((o) => o.due_date !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  due_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

class ScanAssignmentGroupDto {
  @IsInt()
  @Min(1)
  assignee_id: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  ids: number[];
}

/** MISS-0203: "Assign selected groups" of the post-scan modal; unselected groups are left out. */
class ScanAssignmentDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ScanAssignmentGroupDto)
  groups: ScanAssignmentGroupDto[];
}

const PROMPT_VARIANTS = ['explain', 'ticket', 'brief'] as const;
const PROMPT_LANGS = ['en', 'fr'] as const;

class PromptCopiedDto {
  @IsIn(PROMPT_VARIANTS as unknown as string[])
  variant: (typeof PROMPT_VARIANTS)[number];

  @IsIn(PROMPT_LANGS as unknown as string[])
  lang: (typeof PROMPT_LANGS)[number];
}

@Controller('opportunities')
export class OpportunitiesController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly digest: OpportunityDigestService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('property_id') propertyId?: string,
    @Query('rule') rule?: string,
    @Query('priority') priority?: string,
    @Query('subject') subject?: string,
    @Query('assignee_id') assigneeId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    // MISS-0197: paged when page_size (10, 50 or 250) is given; the full list otherwise
    const paging =
      pageSize === undefined || pageSize === ''
        ? undefined
        : {
            page: page ? Number.parseInt(page, 10) : 1,
            page_size: parseUrlPageSize(pageSize),
          };
    return this.opportunities.list(
      {
        status: status ?? 'active',
        property_id: propertyId ? Number(propertyId) : undefined,
        rule,
        priority,
        subject,
        assignee_id: assigneeId ? Number(assigneeId) : undefined,
      },
      paging,
    );
  }

  @Get('rules')
  rules() {
    return this.opportunities.getRules();
  }

  @Put('rules')
  putRules(@Body() body: Record<string, unknown>) {
    return this.opportunities.putRules(body);
  }

  @Post('scan')
  @HttpCode(200)
  scan() {
    return this.opportunities.scan();
  }

  /** MISS-0203: start a manual scan in the background; poll GET scan/:scanId for the result. */
  @Post('scan/start')
  @HttpCode(202)
  startScan() {
    return this.opportunities.startScan();
  }

  @Get('scan/:scanId')
  scanJob(@Param('scanId', new ParseUUIDPipe()) scanId: string) {
    return this.opportunities.scanJob(scanId);
  }

  /** MISS-0203: assign the opportunities a scan created; never reruns the scan. */
  @Post('scan/:scanId/assign')
  @HttpCode(200)
  assignScan(
    @Param('scanId', new ParseUUIDPipe()) scanId: string,
    @Req() req: { user: AuthUser },
    @Body() body: ScanAssignmentDto,
  ) {
    return this.opportunities.assignScanResults(
      scanId,
      req.user.userId,
      body.groups,
    );
  }

  /** MISS-0196: this week's digest of the caller's workspace, rendered but never sent. */
  @Roles('admin')
  @Post('digest/preview')
  @HttpCode(200)
  digestPreview() {
    return this.digest.preview();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.opportunities.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
    @Body() body: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(id, req.user.userId, body);
  }

  /** MISS-0190: usage trace when the web app copies the AI prompt of an opportunity. */
  @Post(':id/prompt-copied')
  @HttpCode(204)
  promptCopied(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
    @Body() body: PromptCopiedDto,
  ) {
    return this.opportunities.promptCopied(id, req.user.userId, body);
  }
}
