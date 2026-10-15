import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { OpportunityEvent } from './opportunity-event.entity';

export const OPPORTUNITY_RULES = [
  'clicks_drop',
  'impressions_drop',
  'low_ctr',
  'near_page_one',
  'cannibalization',
] as const;
export type OpportunityRule = (typeof OPPORTUNITY_RULES)[number];

export const OPPORTUNITY_STATUSES = [
  'open',
  'in_progress',
  'done',
  'dismissed',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_PRIORITIES = ['low', 'medium', 'high'] as const;
export type OpportunityPriority = (typeof OPPORTUNITY_PRIORITIES)[number];

export type OpportunityConfidence = 'low' | 'medium' | 'high';
export type OpportunitySubject = 'property' | 'page' | 'query';

/**
 * One evidence-backed, trackable piece of SEO work (MISS-0093). Heuristic findings are
 * labelled "possible" in title/reason; nothing here claims a confirmed Google cause.
 */
@Entity('opportunities')
@Unique('UQ_opportunities_fingerprint', ['workspace_id', 'fingerprint'])
@Index('IDX_opportunities_list', ['workspace_id', 'status', 'property_id'])
export class Opportunity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @Column({ type: 'int' })
  property_id: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ type: 'enum', enum: OPPORTUNITY_RULES })
  rule: OpportunityRule;

  @Column({ type: 'enum', enum: ['property', 'page', 'query'] })
  subject: OpportunitySubject;

  /** page URL or query text ('' for property-level) */
  @Column({ type: 'varchar', length: 2048 })
  key_text: string;

  /** md5(rule|property|subject|key) — one live item per finding, prevents duplicate alerts */
  @Column({ type: 'char', length: 32 })
  fingerprint: string;

  @Column({ type: 'enum', enum: OPPORTUNITY_STATUSES, default: 'open' })
  status: OpportunityStatus;

  @Column({ type: 'enum', enum: OPPORTUNITY_PRIORITIES, default: 'medium' })
  priority: OpportunityPriority;

  /** 0..100, from the rule's magnitude; drives default priority and sorting */
  @Column({ type: 'int', unsigned: true, default: 0 })
  score: number;

  @Column({ type: 'enum', enum: ['low', 'medium', 'high'], default: 'medium' })
  confidence: OpportunityConfidence;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text' })
  suggested_action: string;

  /** JSON: period, previous period, current/previous metrics, thresholds, extra rows (competing pages…) */
  @Column({ type: 'text' })
  evidence: string;

  @Column({ type: 'int', nullable: true })
  assignee_id: number | null;

  @Column({ type: 'date', nullable: true })
  due_date: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dismissed_at: Date | null;

  @Column({ type: 'timestamp' })
  first_seen_at: Date;

  @Column({ type: 'timestamp' })
  last_seen_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => OpportunityEvent, (e) => e.opportunity)
  events: OpportunityEvent[];
}
