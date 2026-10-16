import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0110:
 *  - workspace_members: server-side tenant membership (a user sees one workspace)
 *  - users.token_version: bumping it invalidates every JWT issued before
 *  - sync_runs.status 'partial', properties.last_sync_status + coverage JSON
 *  - *_metrics.run_id: marks rows written by the latest complete fetch so stale rows
 *    in a fully re-fetched window can be removed
 */
export class AddTenancyAndSyncCoverage1792090000000 implements MigrationInterface {
  name = 'AddTenancyAndSyncCoverage1792090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`token_version\` int UNSIGNED NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `CREATE TABLE \`workspace_members\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`user_id\` int NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_workspace_members_pair\` (\`workspace_id\`, \`user_id\`), INDEX \`IDX_workspace_members_user\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`workspace_members\` ADD CONSTRAINT \`FK_workspace_members_workspace\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`workspace_members\` ADD CONSTRAINT \`FK_workspace_members_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // every existing user belongs to the (single) workspace that existed before this change
    await queryRunner.query(
      `INSERT INTO \`workspace_members\` (\`workspace_id\`, \`user_id\`) SELECT w.id, u.id FROM \`users\` u JOIN (SELECT MIN(id) AS id FROM \`workspaces\`) w ON w.id IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sync_runs\` CHANGE \`status\` \`status\` enum ('running', 'ok', 'partial', 'failed') NOT NULL DEFAULT 'running'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`properties\` ADD \`last_sync_status\` enum ('ok', 'partial', 'failed') NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`properties\` ADD \`coverage\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`daily_metrics\` ADD \`run_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dimension_metrics\` ADD \`run_id\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dimension_metrics\` DROP COLUMN \`run_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`daily_metrics\` DROP COLUMN \`run_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`properties\` DROP COLUMN \`coverage\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`properties\` DROP COLUMN \`last_sync_status\``,
    );
    await queryRunner.query(
      `UPDATE \`sync_runs\` SET \`status\` = 'ok' WHERE \`status\` = 'partial'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sync_runs\` CHANGE \`status\` \`status\` enum ('running', 'ok', 'failed') NOT NULL DEFAULT 'running'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`workspace_members\` DROP FOREIGN KEY \`FK_workspace_members_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`workspace_members\` DROP FOREIGN KEY \`FK_workspace_members_workspace\``,
    );
    await queryRunner.query(`DROP TABLE \`workspace_members\``);
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`token_version\``,
    );
  }
}
