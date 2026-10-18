import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0116:
 *  - users.approval_status: self-service signups wait for an operator (existing rows = approved)
 *  - users.company: names the workspace created on approval
 *  - password_resets: single-use reset tokens (sha256 only)
 */
export class AddSignupAndPasswordReset1792100000000 implements MigrationInterface {
  name = 'AddSignupAndPasswordReset1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`approval_status\` enum ('approved', 'pending', 'rejected') NOT NULL DEFAULT 'approved'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`company\` varchar(120) NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE \`password_resets\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`token_hash\` char(64) NOT NULL, \`expires_at\` datetime NOT NULL, \`used_at\` datetime NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_password_resets_user\` (\`user_id\`), UNIQUE INDEX \`UQ_password_resets_token\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` ADD CONSTRAINT \`FK_password_resets_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`password_resets\` DROP FOREIGN KEY \`FK_password_resets_user\``,
    );
    await queryRunner.query(`DROP TABLE \`password_resets\``);
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`company\``);
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`approval_status\``,
    );
  }
}
