import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OverviewModule } from '../overview/overview.module';
import { PropertiesModule } from '../properties/properties.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ReportDelivery } from './entities/report-delivery.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Report } from './entities/report.entity';
import { ReportsController } from './reports.controller';
import { ReportsScheduler } from './reports.scheduler';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportSchedule, ReportDelivery]),
    OverviewModule,
    OpportunitiesModule,
    PropertiesModule,
    WorkspacesModule,
    IntegrationsModule,
  ],
  providers: [ReportsService, ReportsScheduler],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
