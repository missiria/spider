import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WebhookDelivery } from './webhook-delivery.entity';

export const WEBHOOK_EVENTS = [
  'opportunity.created',
  'sync.failed',
  'property.revoked',
  'report.generated',
  'alert.triggered',
  'test',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Outbound webhook endpoint; payloads are HMAC-SHA256 signed with `secret` (docs/WEBHOOKS.md). */
@Entity('webhooks')
@Index('IDX_webhooks_workspace', ['workspace_id', 'enabled'])
export class Webhook {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  /** shared secret shown once at creation; stored as given (needed to sign) */
  @Column({ type: 'varchar', length: 128 })
  secret: string;

  /** JSON WebhookEvent[] */
  @Column({ type: 'text' })
  events: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 16, nullable: true })
  last_status: 'ok' | 'failed' | null;

  @Column({ type: 'timestamp', nullable: true })
  last_delivery_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => WebhookDelivery, (d) => d.webhook)
  deliveries: WebhookDelivery[];
}
