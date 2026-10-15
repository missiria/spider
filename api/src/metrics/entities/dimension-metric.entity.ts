import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

/** One GSC dimension per row set. `search_appearance` cannot be combined with other dimensions in the API. */
export const DIMENSIONS = ['query', 'page', 'country', 'device', 'search_appearance'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Daily Search Analytics rows broken down by ONE dimension (date × dimension).
 * Sums over a period give top pages/queries/countries/devices for any date range.
 */
@Entity('dimension_metrics')
@Unique('UQ_dimension_metrics_row', ['property_id', 'date', 'dimension', 'key_hash'])
@Index('IDX_dimension_metrics_lookup', ['property_id', 'dimension', 'date'])
export class DimensionMetric {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: DIMENSIONS })
  dimension: Dimension;

  /** query text, page URL, ISO-3166-1 alpha-3 country, device (DESKTOP/MOBILE/TABLET) or search appearance name */
  @Column({ type: 'varchar', length: 2048 })
  key_text: string;

  /** md5(key_text) keeps the unique index short */
  @Column({ type: 'char', length: 32 })
  key_hash: string;

  @Column({ type: 'int', unsigned: true })
  clicks: number;

  @Column({ type: 'int', unsigned: true })
  impressions: number;

  @Column({ type: 'double' })
  ctr: number;

  @Column({ type: 'double' })
  position: number;
}
