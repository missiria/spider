import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import {
  IndexingImport,
  IndexingScope,
  INDEXING_SCOPES,
} from './indexing-import.entity';

/**
 * Where a reason sits in the report:
 *  - not_indexed : "Why pages aren't indexed"
 *  - indexed     : rows of indexed pages (e.g. "Indexed, though blocked by robots.txt")
 *  - improvement : "Improve page experience" / non-critical items
 */
export type IndexingReasonGroup = 'not_indexed' | 'indexed' | 'improvement';

/**
 * One reason row of an import, stored with Google's original wording. The reason is a free
 * string + md5, so a new or renamed Google reason needs no schema or code change.
 */
@Entity('indexing_reasons')
@Index('IDX_indexing_reasons_lookup', [
  'property_id',
  'scope_hash',
  'reason_hash',
])
@Index('IDX_indexing_reasons_import', ['import_id'])
export class IndexingReason {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  import_id: number;

  @ManyToOne(() => IndexingImport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'import_id' })
  import: IndexingImport;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'enum', enum: INDEXING_SCOPES })
  scope: IndexingScope;

  @Column({ type: 'char', length: 32 })
  scope_hash: string;

  @Column({ type: 'date' })
  report_date: string;

  @Column({ type: 'varchar', length: 512 })
  reason: string;

  @Column({ type: 'char', length: 32 })
  reason_hash: string;

  /** "Website" or "Google" as exported (free text: kept even if Google adds a value) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @Column({ type: 'enum', enum: ['not_indexed', 'indexed', 'improvement'] })
  reason_group: IndexingReasonGroup;

  /** validation column as exported ("Not Started", "Passed", "Failed", …) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  validation: string | null;

  @Column({ type: 'int', unsigned: true })
  pages: number;
}
