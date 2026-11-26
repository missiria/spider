import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * One row per sign-in (MISS-0199). The JWT carries the row id as `jti`:
 *  - sign-out sets `ended_at`, and that token is refused from then on (other devices keep theirs);
 *  - `last_seen_at` is bumped by authenticated requests (at most once a minute) and drives
 *    the online indicator on the System page;
 *  - `token_version` is the user's value at sign-in: any later bump (sign out everywhere,
 *    password reset, deactivation) makes the row count as ended without touching it.
 */
@Entity('user_sessions')
@Index('IDX_user_sessions_user', ['user_id', 'ended_at', 'last_seen_at'])
export class UserSession {
  /** 32 hex chars, also the JWT `jti` */
  @PrimaryColumn({ type: 'char', length: 32 })
  id: string;

  @Column({ type: 'int' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'int', unsigned: true, default: 0 })
  token_version: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp' })
  last_seen_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  ended_at: Date | null;
}
