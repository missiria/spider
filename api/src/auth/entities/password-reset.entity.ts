import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Single-use reset link. Only the sha256 of the token is stored. */
@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_password_resets_user')
  @Column({ type: 'int' })
  user_id: number;

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
