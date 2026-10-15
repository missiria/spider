import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AuthUser } from '../auth/jwt.strategy';
import {
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STATUSES,
  OpportunityPriority,
  OpportunityStatus,
} from './entities/opportunity.entity';
import { OpportunitiesService } from './opportunities.service';

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

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('property_id') propertyId?: string,
    @Query('rule') rule?: string,
    @Query('priority') priority?: string,
    @Query('subject') subject?: string,
    @Query('assignee_id') assigneeId?: string,
  ) {
    return this.opportunities.list({
      status: status ?? 'active',
      property_id: propertyId ? Number(propertyId) : undefined,
      rule,
      priority,
      subject,
      assignee_id: assigneeId ? Number(assigneeId) : undefined,
    });
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
}
