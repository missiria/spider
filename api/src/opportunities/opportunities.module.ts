import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { IndexingModule } from '../indexing/indexing.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { PropertiesModule } from '../properties/properties.module';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OpportunityDigestDelivery } from './entities/opportunity-digest-delivery.entity';
import { OpportunityEvent } from './entities/opportunity-event.entity';
import { OpportunityRulesConfig } from './entities/opportunity-rules.entity';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesScheduler } from './opportunities.scheduler';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityDigestService } from './opportunity-digest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Opportunity,
      OpportunityEvent,
      OpportunityRulesConfig,
      DailyMetric,
      DimensionMetric,
      OpportunityDigestDelivery,
      WorkspaceMember,
    ]),
    PropertiesModule,
    WorkspacesModule,
    GscModule,
    IndexingModule,
    IntegrationsModule,
  ],
  providers: [
    OpportunitiesService,
    OpportunitiesScheduler,
    OpportunityDigestService,
  ],
  controllers: [OpportunitiesController],
  exports: [OpportunitiesService, OpportunityDigestService],
})
export class OpportunitiesModule {}
