import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0121: global email-branding revisions (draft/published, actor, timestamp).
 *
 * Timestamped after AddBrandLogo1792700000000 (MISS-0135) so it runs last on databases that
 * already have main's migrations. The feature branch first shipped it as
 * EmailBrandRevisions1792600000000; a database that ran that name already has the table, hence
 * IF NOT EXISTS (the old row in `migrations` is inert).
 */
export class EmailBrandRevisions1792800000000 implements MigrationInterface {
  name = 'EmailBrandRevisions1792800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE IF NOT EXISTS `email_brand_revisions` (`id` int NOT NULL AUTO_INCREMENT, `brand` json NOT NULL, `status` varchar(16) NOT NULL, `actor_id` int NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), INDEX `IDX_email_brand_status_id` (`status`, `id`)) ENGINE=InnoDB',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `email_brand_revisions`');
  }
}
