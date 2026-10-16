import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

@Entity('daily_metrics')
@Unique('UQ_daily_metrics_property_date', ['property_id', 'date'])
export class DailyMetric {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, (property) => property.daily_metrics, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', unsigned: true })
  clicks: number;

  @Column({ type: 'int', unsigned: true })
  impressions: number;

  /** as reported by GSC (0..1); recomputed from sums when aggregating */
  @Column({ type: 'double' })
  ctr: number;

  @Column({ type: 'double' })
  position: number;

  /** sync run that last wrote the row; rows of a complete re-fetch not carrying it are stale */
  @Column({ type: 'int', nullable: true })
  run_id: number | null;
}
