import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AlertChannel = 'email' | 'webhook';

/** What to alert on; evaluated after scans and syncs, delivered by email or to a webhook. */
export interface AlertConfig {
  /** fire for new opportunities with priority in this list (empty = none) */
  opportunity_priorities: ('high' | 'medium' | 'low')[];
  /** restrict to these rules (empty = all) */
  opportunity_rules: string[];
  /** restrict to these property ids (empty = all) */
  property_ids: number[];
  sync_failed: boolean;
  property_revoked: boolean;
}

@Entity('alert_rules')
@Index('IDX_alert_rules_workspace', ['workspace_id', 'enabled'])
export class AlertRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: ['email', 'webhook'] })
  channel: AlertChannel;

  /** email: JSON string[] recipients; webhook: webhook id as string */
  @Column({ type: 'text' })
  target: string;

  /** JSON AlertConfig */
  @Column({ type: 'text' })
  config: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_fired_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
