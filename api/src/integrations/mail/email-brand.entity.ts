import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface EmailBrand {
  name: string;
  logoUrl: string;
  accentColor: string;
  supportEmail: string;
  company: string;
  footer: string;
  websiteUrl: string;
}

/** Append-only revisions retain who drafted/published each global brand. */
@Entity('email_brand_revisions')
export class EmailBrandRevision {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'json' }) brand: EmailBrand;
  @Column({ type: 'varchar', length: 16 }) status: 'draft' | 'published';
  @Column({ type: 'int' }) actor_id: number;
  @CreateDateColumn() created_at: Date;
}
