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
import { User } from '../../users/entities/user.entity';
import { Workspace } from './workspace.entity';

/**
 * Tenant membership (ADR-0007). Every authenticated request resolves its workspace from
 * this table, never from the client. A user has one membership in MVP-1.
 */
@Entity('workspace_members')
@Unique('UQ_workspace_members_pair', ['workspace_id', 'user_id'])
export class WorkspaceMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspace_id: number;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Index('IDX_workspace_members_user')
  @Column({ type: 'int' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
