import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0199: one row per sign-in. Lets sign-out end that token server-side and gives the
 * System page a real online / last-seen indicator per member.
 */
export class AddUserSessions1795200000000 implements MigrationInterface {
  name = 'AddUserSessions1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_sessions\` (\`id\` char(32) NOT NULL, \`user_id\` int NOT NULL, \`token_version\` int UNSIGNED NOT NULL DEFAULT '0', \`user_agent\` varchar(255) NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`last_seen_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`ended_at\` timestamp NULL, INDEX \`IDX_user_sessions_user\` (\`user_id\`, \`ended_at\`, \`last_seen_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_sessions\` ADD CONSTRAINT \`FK_user_sessions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_sessions\` DROP FOREIGN KEY \`FK_user_sessions_user\``,
    );
    await queryRunner.query(`DROP TABLE \`user_sessions\``);
  }
}
