import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Per-workspace thresholds; defaults live in rules.config.ts and apply when a field is absent. */
@Entity('opportunity_rules')
export class OpportunityRulesConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  workspace_id: number;

  /** JSON partial of RuleConfig */
  @Column({ type: 'text' })
  config: string;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
