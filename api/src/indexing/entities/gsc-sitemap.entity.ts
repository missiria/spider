import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

/** Snapshot of one sitemap as the Search Console Sitemaps API reports it at `fetched_at`. */
@Entity('gsc_sitemaps')
@Index('IDX_gsc_sitemaps_property', ['property_id', 'fetched_at'])
export class GscSitemap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'varchar', length: 2048 })
  path: string;

  @Column({ type: 'timestamp' })
  fetched_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_submitted: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_downloaded: Date | null;

  @Column({ type: 'boolean', default: false })
  is_pending: boolean;

  @Column({ type: 'boolean', default: false })
  is_sitemaps_index: boolean;

  @Column({ type: 'int', unsigned: true, default: 0 })
  warnings: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  errors: number;

  /** JSON: [{ type, submitted }] as returned by the API */
  @Column({ type: 'text', nullable: true })
  contents: string | null;

  /** URLs Spider read from the live sitemap file (null when not fetched) */
  @Column({ type: 'int', unsigned: true, nullable: true })
  urls_read: number | null;

  @Column({ type: 'boolean', default: false })
  urls_truncated: boolean;

  @Column({ type: 'text', nullable: true })
  fetch_error: string | null;
}
