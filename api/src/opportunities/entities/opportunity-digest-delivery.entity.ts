import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';

export type DigestDeliveryStatus = 'sent' | 'skipped' | 'failed';

/**
 * Weekly opportunities email (MISS-0196): one row per (recipient, workspace, ISO week). The row
 * is claimed BEFORE the mail goes out, so a rerun, a restart or two workers racing on the same
 * Monday never email the same person twice for the same week (same pattern as report_deliveries).
 */
@Entity('opportunity_digest_deliveries')
@Unique('UQ_opportunity_digest_deliveries_week', [
  'user_id',
  'workspace_id',
  'week_key',
])
export class OpportunityDigestDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'workspace_id',
    foreignKeyConstraintName: 'FK_opportunity_digest_deliveries_workspace',
  })
  workspace: Workspace;

  @Column({ type: 'int' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_opportunity_digest_deliveries_user',
  })
  user: User;

  /** ISO week of the send, e.g. 2026-W48 */
  @Column({ type: 'varchar', length: 16 })
  week_key: string;

  @Column({ type: 'enum', enum: ['sent', 'skipped', 'failed'] })
  status: DigestDeliveryStatus;

  /** new opportunities listed in the digest (before the 25-item cap) */
  @Column({ type: 'int', unsigned: true, default: 0 })
  opportunity_count: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
