import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TokenPurpose = 'reset' | 'verify';

/**
 * Single-use emailed link (password reset or signup email confirmation). Only the sha256 of the
 * token is stored. The row is bound to the email and token_version it was issued for: changing
 * either (email change, password reset, revocation, deactivation) kills the link.
 */
@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_password_resets_user')
  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'enum', enum: ['reset', 'verify'], default: 'reset' })
  purpose: TokenPurpose;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  token_version: number;

  @Index('UQ_password_resets_token', { unique: true })
  @Column({ type: 'char', length: 64 })
  token_hash: string;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  used_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
