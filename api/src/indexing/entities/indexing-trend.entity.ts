import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexingImport } from './indexing-import.entity';

/**
 * Chart rows of an export. For an overview export: indexed / not indexed per day. For an issue
 * export: affected pages per day (stored in `not_indexed`, `indexed` null).
 */
@Entity('indexing_trend')
@Index('IDX_indexing_trend_import', ['import_id', 'date'])
export class IndexingTrend {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  import_id: number;

  @ManyToOne(() => IndexingImport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'import_id' })
  import: IndexingImport;

  @Column({ type: 'int' })
  property_id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', unsigned: true, nullable: true })
  indexed: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  not_indexed: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  impressions: number | null;
}
