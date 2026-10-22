import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** JSON Brand (workspaces/brand.ts) used on PDF reports; null = defaults */
  @Column({ type: 'text', nullable: true })
  brand: string | null;

  /**
   * JSON StoredLogo { mime, width, height, bytes, data(base64) } — the approved report logo,
   * kept in the database (no file path to leak). Not selected by default: read it with
   * WorkspacesService.logo().
   */
  @Column({ type: 'mediumtext', nullable: true, select: false })
  brand_logo: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @OneToMany(() => Property, (property) => property.workspace)
  properties: Property[];
}
