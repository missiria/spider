import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { PropertiesModule } from '../properties/properties.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OpportunityEvent } from './entities/opportunity-event.entity';
import { OpportunityRulesConfig } from './entities/opportunity-rules.entity';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesScheduler } from './opportunities.scheduler';
import { OpportunitiesService } from './opportunities.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Opportunity,
      OpportunityEvent,
      OpportunityRulesConfig,
      DailyMetric,
      DimensionMetric,
    ]),
    PropertiesModule,
    WorkspacesModule,
    GscModule,
  ],
  providers: [OpportunitiesService, OpportunitiesScheduler],
  controllers: [OpportunitiesController],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
