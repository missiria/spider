import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReportDelivery } from './report-delivery.entity';
import { Report } from './report.entity';

export type ScheduleFrequency = 'weekly' | 'monthly';

/** When and to whom a report template is emailed. Paused = enabled false. */
@Entity('report_schedules')
@Index('IDX_report_schedules_due', ['enabled', 'next_run_at'])
export class ReportSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'int' })
  report_id: number;

  @ManyToOne(() => Report, (r) => r.schedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: Report;

  @Column({ type: 'enum', enum: ['weekly', 'monthly'] })
  frequency: ScheduleFrequency;

  /** weekly: 1 = Monday … 7 = Sunday; monthly: 1..28 */
  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  day: number;

  /** hour of day, server time (0..23) */
  @Column({ type: 'tinyint', unsigned: true, default: 7 })
  hour: number;

  /** JSON string[] of email addresses */
  @Column({ type: 'text' })
  recipients: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  next_run_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_run_at: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  last_status: 'sent' | 'failed' | 'skipped' | null;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => ReportDelivery, (d) => d.schedule)
  deliveries: ReportDelivery[];
}
