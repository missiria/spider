import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { DailyMetric } from '../../metrics/entities/daily-metric.entity';
import { TopRow } from '../../metrics/entities/top-row.entity';
import { SyncRun } from '../../sync/entities/sync-run.entity';

export type PropertyStatus = 'pending' | 'connected' | 'revoked' | 'error';

@Entity('properties')
@Unique('UQ_properties_workspace_site', ['workspace_id', 'site_url'])
export class Property {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @ManyToOne(() => Workspace, (workspace) => workspace.properties, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  /** GSC siteUrl exactly as the API reports it: "https://www.example.com/" or "sc-domain:example.com" */
  @Column({ type: 'varchar', length: 255 })
  site_url: string;

  @Column({ type: 'varchar', length: 120 })
  display_name: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'connected', 'revoked', 'error'],
    default: 'pending',
  })
  status: PropertyStatus;

  @Column({ type: 'timestamp', nullable: true })
  connected_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_checked_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_sync_at: Date | null;

  /** first date with rows in GSC (null until the backfill ran) */
  @Column({ type: 'date', nullable: true })
  data_since: string | null;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => DailyMetric, (row) => row.property)
  daily_metrics: DailyMetric[];

  @OneToMany(() => TopRow, (row) => row.property)
  top_rows: TopRow[];

  @OneToMany(() => SyncRun, (run) => run.property)
  sync_runs: SyncRun[];
}
