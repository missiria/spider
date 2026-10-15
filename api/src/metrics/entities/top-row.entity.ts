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

export type TopDimension = 'page' | 'query';

@Entity('top_rows')
@Unique('UQ_top_rows_period_dimension_key', [
  'property_id',
  'period_start',
  'period_end',
  'dimension',
  'key_hash',
])
@Index('IDX_top_rows_lookup', ['property_id', 'period_start', 'period_end', 'dimension'])
export class TopRow {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, (property) => property.top_rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'date' })
  period_start: string;

  @Column({ type: 'date' })
  period_end: string;

  @Column({ type: 'enum', enum: ['page', 'query'] })
  dimension: TopDimension;

  /** the page URL or the query text */
  @Column({ type: 'varchar', length: 2048 })
  key_text: string;

  /** md5 of key_text so the unique index stays short */
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
