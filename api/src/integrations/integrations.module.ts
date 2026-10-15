import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlertsService } from './alerts.service';
import { AlertEvent } from './entities/alert-event.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';
import {
  AlertsController,
  WebhooksController,
} from './integrations.controller';
import { MailerService } from './mailer.service';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Webhook,
      WebhookDelivery,
      AlertRule,
      AlertEvent,
      Opportunity,
      SyncRun,
      Property,
    ]),
    WorkspacesModule,
  ],
  providers: [MailerService, WebhooksService, AlertsService],
  controllers: [WebhooksController, AlertsController],
  exports: [MailerService, WebhooksService, AlertsService],
})
export class IntegrationsModule {}
