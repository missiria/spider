import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'admin' | 'member';

/**
 * Self-service signups start `unverified` (email not confirmed, invisible to operators), become
 * `pending` once the emailed link is opened, and can sign in only when an operator approves.
 */
export type ApprovalStatus = 'approved' | 'unverified' | 'pending' | 'rejected';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: ['admin', 'member'], default: 'admin' })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({
    type: 'enum',
    enum: ['approved', 'unverified', 'pending', 'rejected'],
    default: 'approved',
  })
  approval_status: ApprovalStatus;

  /** company typed on the signup form; names the workspace created on approval */
  @Column({ type: 'varchar', length: 120, nullable: true })
  company: string | null;

  /** bumped to revoke every session issued before (JWT carries it as `ver`) */
  @Column({ type: 'int', unsigned: true, default: 0 })
  token_version: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
