import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

export type SyncKind = 'backfill' | 'incremental' | 'top';
export type SyncStatus = 'running' | 'ok' | 'failed';

@Entity('sync_runs')
@Index('IDX_sync_runs_property_started', ['property_id', 'started_at'])
export class SyncRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, (property) => property.sync_runs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'enum', enum: ['backfill', 'incremental', 'top'] })
  kind: SyncKind;

  @Column({ type: 'enum', enum: ['running', 'ok', 'failed'], default: 'running' })
  status: SyncStatus;

  @CreateDateColumn({ type: 'timestamp' })
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  finished_at: Date | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  rows_upserted: number;

  /** inclusive GSC date range the run covered */
  @Column({ type: 'date', nullable: true })
  range_start: string | null;

  @Column({ type: 'date', nullable: true })
  range_end: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;
}
