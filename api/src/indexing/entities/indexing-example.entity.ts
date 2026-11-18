import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexingImport } from './indexing-import.entity';

/** Example URLs listed in an issue export (at most 1,000 per Search Console). */
@Entity('indexing_examples')
@Index('IDX_indexing_examples_import', ['import_id'])
@Index('IDX_indexing_examples_reason', ['property_id', 'reason_hash'])
export class IndexingExample {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  import_id: number;

  @ManyToOne(() => IndexingImport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'import_id' })
  import: IndexingImport;

  @Column({ type: 'int' })
  property_id: number;

  @Column({ type: 'char', length: 32 })
  reason_hash: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  /** "Last crawled" as exported, null when Google shows none */
  @Column({ type: 'date', nullable: true })
  last_crawled: string | null;
}
