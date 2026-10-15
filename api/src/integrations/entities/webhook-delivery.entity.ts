import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Webhook } from './webhook.entity';

/** Delivery log + retry queue. (webhook, dedupe_key) is unique so one event is sent once per endpoint. */
@Entity('webhook_deliveries')
@Unique('UQ_webhook_deliveries_dedupe', ['webhook_id', 'dedupe_key'])
@Index('IDX_webhook_deliveries_pending', ['status', 'next_attempt_at'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  webhook_id: number;

  @ManyToOne(() => Webhook, (w) => w.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook: Webhook;

  @Column({ type: 'varchar', length: 64 })
  event: string;

  /** e.g. opportunity:42, sync_run:17, report:3:2026-W42 */
  @Column({ type: 'varchar', length: 191 })
  dedupe_key: string;

  /** JSON payload as sent */
  @Column({ type: 'text' })
  payload: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'ok', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'ok' | 'failed';

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts: number;

  @Column({ type: 'int', nullable: true })
  response_status: number | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamp', nullable: true })
  next_attempt_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
