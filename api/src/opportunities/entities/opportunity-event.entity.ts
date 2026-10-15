import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Opportunity } from './opportunity.entity';

export type OpportunityEventType =
  | 'created'
  | 'evidence_updated'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'due_date'
  | 'note';

/** Append-only audit history; completed and dismissed items keep every event. */
@Entity('opportunity_events')
@Index('IDX_opportunity_events_opp', ['opportunity_id', 'created_at'])
export class OpportunityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  opportunity_id: number;

  @ManyToOne(() => Opportunity, (o) => o.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  /** null = the scanner */
  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({
    type: 'enum',
    enum: [
      'created',
      'evidence_updated',
      'status',
      'priority',
      'assignee',
      'due_date',
      'note',
    ],
  })
  type: OpportunityEventType;

  /** JSON: { from, to } for field changes, { text } for notes, { score, summary } for evidence */
  @Column({ type: 'text', nullable: true })
  payload: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
