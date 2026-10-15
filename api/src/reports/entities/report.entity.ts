import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReportSchedule } from './report-schedule.entity';

export type ReportScope = 'fleet' | 'property';

export const REPORT_SECTIONS = [
  'overview',
  'pages',
  'queries',
  'countries',
  'devices',
  'search_appearance',
  'opportunities',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/** Config stored as JSON on the template; mirrors a saved view plus the sections to include. */
export interface ReportConfig {
  period: { days?: number; start?: string; end?: string };
  sections: ReportSection[];
  filters?: {
    include_query?: string;
    exclude_query?: string;
    include_page?: string;
    exclude_page?: string;
  };
  /** max rows per table section (default 50, PDF caps at 50) */
  limit?: number;
  notes?: string;
}

/** Reusable report template (MISS-0094): what to render, for which scope, with which filters. */
@Entity('reports')
@Index('IDX_reports_workspace', ['workspace_id', 'scope', 'property_id'])
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'int' })
  created_by: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: ['fleet', 'property'] })
  scope: ReportScope;

  @Column({ type: 'int', nullable: true })
  property_id: number | null;

  /** JSON ReportConfig */
  @Column({ type: 'text' })
  config: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => ReportSchedule, (s) => s.report)
  schedules: ReportSchedule[];
}
