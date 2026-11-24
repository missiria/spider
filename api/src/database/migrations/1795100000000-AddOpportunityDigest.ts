import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0196: weekly opportunities email. `opportunity_digest_deliveries` is the per-recipient,
 * per-ISO-week claim that keeps the Monday digest idempotent; `users.weekly_opportunities_email`
 * is the opt-out (default on).
 */
export class AddOpportunityDigest1795100000000 implements MigrationInterface {
  name = 'AddOpportunityDigest1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`weekly_opportunities_email\` tinyint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE TABLE \`opportunity_digest_deliveries\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`user_id\` int NOT NULL, \`week_key\` varchar(16) NOT NULL, \`status\` enum ('sent', 'skipped', 'failed') NOT NULL, \`opportunity_count\` int UNSIGNED NOT NULL DEFAULT '0', \`error\` text NULL, \`sent_at\` timestamp NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_opportunity_digest_deliveries_week\` (\`user_id\`, \`workspace_id\`, \`week_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunity_digest_deliveries\` ADD CONSTRAINT \`FK_opportunity_digest_deliveries_workspace\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunity_digest_deliveries\` ADD CONSTRAINT \`FK_opportunity_digest_deliveries_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`opportunity_digest_deliveries\` DROP FOREIGN KEY \`FK_opportunity_digest_deliveries_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunity_digest_deliveries\` DROP FOREIGN KEY \`FK_opportunity_digest_deliveries_workspace\``,
    );
    await queryRunner.query(`DROP TABLE \`opportunity_digest_deliveries\``);
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`weekly_opportunities_email\``,
    );
  }
}
