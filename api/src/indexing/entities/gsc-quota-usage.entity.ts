import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Calls Spider made per property, API and day (Pacific day is what Google resets on; we use
 * the UTC date, which is conservative by a few hours). URL Inspection allows 2,000 calls per
 * property per day.
 */
@Entity('gsc_quota_usage')
@Unique('UQ_gsc_quota_usage', ['property_id', 'api', 'date'])
export class GscQuotaUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  property_id: number;

  @Column({ type: 'varchar', length: 32 })
  api: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  calls: number;
}
