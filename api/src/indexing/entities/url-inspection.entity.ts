import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

/**
 * One URL Inspection API call (history: one row per inspection). It describes Google's
 * INDEXED version of the URL at `inspected_at`, not a live fetch of the page.
 */
@Entity('url_inspections')
@Index('IDX_url_inspections_latest', [
  'property_id',
  'url_hash',
  'inspected_at',
])
export class UrlInspection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'char', length: 32 })
  url_hash: string;

  @Column({ type: 'timestamp' })
  inspected_at: Date;

  /** PASS / PARTIAL / FAIL / NEUTRAL */
  @Column({ type: 'varchar', length: 32, nullable: true })
  verdict: string | null;

  /** Google's text, e.g. "Submitted and indexed", "Not found (404)", "URL is unknown to Google" */
  @Column({ type: 'varchar', length: 255, nullable: true })
  coverage_state: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  indexing_state: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  robots_txt_state: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  page_fetch_state: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  crawled_as: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_crawl_time: Date | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  google_canonical: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  user_canonical: string | null;

  /** JSON array of sitemap URLs Google associates with the page */
  @Column({ type: 'text', nullable: true })
  sitemaps: string | null;

  /** JSON array of referring URLs */
  @Column({ type: 'text', nullable: true })
  referring_urls: string | null;

  /** full API response, kept for audit */
  @Column({ type: 'mediumtext', nullable: true })
  raw: string | null;

  /** set when the call failed; the other columns are then null */
  @Column({ type: 'text', nullable: true })
  error: string | null;
}
