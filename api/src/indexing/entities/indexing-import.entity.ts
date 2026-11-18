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

/**
 * Which Search Console Page indexing view an export came from. Counts from different scopes
 * are never added together (MITP-0833).
 *  - all_known : "All known pages" (default view)
 *  - submitted : "All submitted pages"
 *  - sitemap   : one sitemap, `scope_detail` holds its URL
 */
export const INDEXING_SCOPES = ['all_known', 'submitted', 'sitemap'] as const;
export type IndexingScope = (typeof INDEXING_SCOPES)[number];

/** overview = the Page indexing report itself; issue = the drill-down of one reason. */
export type IndexingReportKind = 'overview' | 'issue';

/**
 * One uploaded Search Console Page indexing export (ADR-0009). The public API has no
 * endpoint for this report, so these numbers only ever come from an operator import.
 */
@Entity('indexing_imports')
@Index('IDX_indexing_imports_property', ['property_id', 'scope', 'report_date'])
export class IndexingImport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'int', nullable: true })
  uploaded_by: number | null;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'enum', enum: ['overview', 'issue'] })
  report_kind: IndexingReportKind;

  @Column({ type: 'enum', enum: INDEXING_SCOPES, default: 'all_known' })
  scope: IndexingScope;

  /** sitemap URL when scope = sitemap */
  @Column({ type: 'varchar', length: 2048, nullable: true })
  scope_detail: string | null;

  /** md5 of scope + scope_detail, so one index covers every scope */
  @Column({ type: 'char', length: 32 })
  scope_hash: string;

  /** reason name for an issue drill-down export */
  @Column({ type: 'varchar', length: 512, nullable: true })
  issue_reason: string | null;

  @Column({ type: 'char', length: 32, nullable: true })
  issue_reason_hash: string | null;

  /**
   * Last date covered by the export (latest chart date, or Google's "last updated" when the
   * export carries it). This is the date every count of the import refers to.
   */
  @Column({ type: 'date' })
  report_date: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  reason_rows: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  trend_rows: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  example_rows: number;

  /** true when the example table hit Search Console's 1,000-row export limit */
  @Column({ type: 'boolean', default: false })
  examples_partial: boolean;

  /** JSON: Metadata.csv key/values and the file list, kept for audit */
  @Column({ type: 'text', nullable: true })
  metadata_raw: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
