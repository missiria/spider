import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

export type TrackedUrlSource = 'sitemap' | 'gsc_page' | 'user';

/**
 * URLs Spider inspects with the URL Inspection API. Built from the property's sitemaps, its
 * pages with Search Analytics impressions, and URLs added by a user. This inventory is NOT
 * Google's "All known pages" report.
 */
@Entity('tracked_urls')
@Unique('UQ_tracked_urls_url', ['property_id', 'url_hash'])
@Index('IDX_tracked_urls_queue', ['property_id', 'last_inspected_at'])
export class TrackedUrl {
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

  @Column({ type: 'boolean', default: false })
  in_sitemap: boolean;

  /** sitemap URL the page was last listed in */
  @Column({ type: 'varchar', length: 2048, nullable: true })
  sitemap: string | null;

  @Column({ type: 'boolean', default: false })
  in_gsc_pages: boolean;

  /** impressions of the last 28 days when the inventory was built (priority signal) */
  @Column({ type: 'int', unsigned: true, default: 0 })
  impressions_28d: number;

  @Column({ type: 'boolean', default: false })
  user_added: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_seen_in_source: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_inspected_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
