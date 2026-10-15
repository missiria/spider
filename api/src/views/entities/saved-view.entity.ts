import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ViewScope = 'fleet' | 'property';

/**
 * A reusable filtered view (MISS-0092): period + table/regex filters, stored as JSON so the
 * web can evolve the shape without migrations. Scoped to a workspace; property views carry
 * the property id.
 */
@Entity('saved_views')
@Index('IDX_saved_views_lookup', ['workspace_id', 'scope', 'property_id'])
export class SavedView {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'enum', enum: ['fleet', 'property'] })
  scope: ViewScope;

  @Column({ type: 'int', nullable: true })
  property_id: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** JSON: { period: {days?|start,end}, table?: {...}, filters?: {...} } — opaque to the API */
  @Column({ type: 'text' })
  config: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
