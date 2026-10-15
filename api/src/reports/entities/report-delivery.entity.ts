import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ReportSchedule } from './report-schedule.entity';

/**
 * One row per (schedule, period). The unique key is what prevents duplicate sends when the
 * hourly worker runs again or after a restart.
 */
@Entity('report_deliveries')
@Unique('UQ_report_deliveries_period', ['schedule_id', 'period_key'])
export class ReportDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  schedule_id: number;

  @ManyToOne(() => ReportSchedule, (s) => s.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: ReportSchedule;

  /** e.g. 2026-W42 or 2026-10 — the slot this delivery covers */
  @Column({ type: 'varchar', length: 16 })
  period_key: string;

  @Column({ type: 'enum', enum: ['sent', 'failed', 'skipped'] })
  status: 'sent' | 'failed' | 'skipped';

  /** JSON string[] recipients at send time */
  @Column({ type: 'text' })
  recipients: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', unsigned: true, default: 1 })
  attempts: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
