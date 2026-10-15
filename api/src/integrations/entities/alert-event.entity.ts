import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** One alert sent (or attempted) per (rule, subject). Unique key prevents duplicate alerts. */
@Entity('alert_events')
@Unique('UQ_alert_events_dedupe', ['rule_id', 'dedupe_key'])
@Index('IDX_alert_events_list', ['workspace_id', 'created_at'])
export class AlertEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'int' })
  rule_id: number;

  /** opportunity:42, sync_run:17, property:4:revoked */
  @Column({ type: 'varchar', length: 191 })
  dedupe_key: string;

  @Column({ type: 'varchar', length: 64 })
  kind: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** JSON payload delivered */
  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'enum', enum: ['sent', 'failed', 'skipped'] })
  status: 'sent' | 'failed' | 'skipped';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
