import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0116 security follow-up:
 *  - users.approval_status gains 'unverified' (signup email not confirmed yet)
 *  - password_resets rows carry purpose (reset | verify) and the email + token_version they
 *    were issued for, so an email change or a session revocation kills outstanding links
 */
export class BindAccountTokens1792100000001 implements MigrationInterface {
  name = 'BindAccountTokens1792100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`approval_status\` \`approval_status\` enum ('approved', 'unverified', 'pending', 'rejected') NOT NULL DEFAULT 'approved'`,
    );
    // links issued before this change are not bound: retire them
    await queryRunner.query(
      `UPDATE \`password_resets\` SET \`used_at\` = NOW() WHERE \`used_at\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` ADD \`purpose\` enum ('reset', 'verify') NOT NULL DEFAULT 'reset'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` ADD \`email\` varchar(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` ADD \`token_version\` int UNSIGNED NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` DROP COLUMN \`token_version\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` DROP COLUMN \`email\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` DROP COLUMN \`purpose\``,
    );
    await queryRunner.query(
      `UPDATE \`users\` SET \`approval_status\` = 'pending' WHERE \`approval_status\` = 'unverified'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`approval_status\` \`approval_status\` enum ('approved', 'pending', 'rejected') NOT NULL DEFAULT 'approved'`,
    );
  }
}
