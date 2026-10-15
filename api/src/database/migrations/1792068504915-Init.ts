import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1792068504915 implements MigrationInterface {
    name = 'Init1792068504915'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`daily_metrics\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`date\` date NOT NULL, \`clicks\` int UNSIGNED NOT NULL, \`impressions\` int UNSIGNED NOT NULL, \`ctr\` double NOT NULL, \`position\` double NOT NULL, UNIQUE INDEX \`UQ_daily_metrics_property_date\` (\`property_id\`, \`date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`top_rows\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`period_start\` date NOT NULL, \`period_end\` date NOT NULL, \`dimension\` enum ('page', 'query') NOT NULL, \`key_text\` varchar(2048) NOT NULL, \`key_hash\` char(32) NOT NULL, \`clicks\` int UNSIGNED NOT NULL, \`impressions\` int UNSIGNED NOT NULL, \`ctr\` double NOT NULL, \`position\` double NOT NULL, INDEX \`IDX_top_rows_lookup\` (\`property_id\`, \`period_start\`, \`period_end\`, \`dimension\`), UNIQUE INDEX \`UQ_top_rows_period_dimension_key\` (\`property_id\`, \`period_start\`, \`period_end\`, \`dimension\`, \`key_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`sync_runs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`kind\` enum ('backfill', 'incremental', 'top') NOT NULL, \`status\` enum ('running', 'ok', 'failed') NOT NULL DEFAULT 'running', \`started_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`finished_at\` timestamp NULL, \`rows_upserted\` int UNSIGNED NOT NULL DEFAULT '0', \`range_start\` date NULL, \`range_end\` date NULL, \`error\` text NULL, INDEX \`IDX_sync_runs_property_started\` (\`property_id\`, \`started_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`properties\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`site_url\` varchar(255) NOT NULL, \`display_name\` varchar(120) NOT NULL, \`status\` enum ('pending', 'connected', 'revoked', 'error') NOT NULL DEFAULT 'pending', \`connected_at\` timestamp NULL, \`last_checked_at\` timestamp NULL, \`last_sync_at\` timestamp NULL, \`data_since\` date NULL, \`last_error\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_9cd2513cd04f57c9967f640b0a\` (\`status\`), UNIQUE INDEX \`UQ_properties_workspace_site\` (\`workspace_id\`, \`site_url\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workspaces\` (\`id\` int NOT NULL AUTO_INCREMENT, \`slug\` varchar(64) NOT NULL, \`name\` varchar(120) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_b8e9fe62e93d60089dfc4f175f\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`password_hash\` varchar(255) NOT NULL, \`name\` varchar(120) NOT NULL, \`role\` enum ('admin', 'member') NOT NULL DEFAULT 'admin', \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`daily_metrics\` ADD CONSTRAINT \`FK_6de0f9f9d45a48236de48053a74\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`top_rows\` ADD CONSTRAINT \`FK_91b0629b095e489f519d42591aa\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`sync_runs\` ADD CONSTRAINT \`FK_e72064a5781f8ad4cd46b4ef558\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`properties\` ADD CONSTRAINT \`FK_5f5a4f54e7eef245b570296c4a2\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`properties\` DROP FOREIGN KEY \`FK_5f5a4f54e7eef245b570296c4a2\``);
        await queryRunner.query(`ALTER TABLE \`sync_runs\` DROP FOREIGN KEY \`FK_e72064a5781f8ad4cd46b4ef558\``);
        await queryRunner.query(`ALTER TABLE \`top_rows\` DROP FOREIGN KEY \`FK_91b0629b095e489f519d42591aa\``);
        await queryRunner.query(`ALTER TABLE \`daily_metrics\` DROP FOREIGN KEY \`FK_6de0f9f9d45a48236de48053a74\``);
        await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_b8e9fe62e93d60089dfc4f175f\` ON \`workspaces\``);
        await queryRunner.query(`DROP TABLE \`workspaces\``);
        await queryRunner.query(`DROP INDEX \`UQ_properties_workspace_site\` ON \`properties\``);
        await queryRunner.query(`DROP INDEX \`IDX_9cd2513cd04f57c9967f640b0a\` ON \`properties\``);
        await queryRunner.query(`DROP TABLE \`properties\``);
        await queryRunner.query(`DROP INDEX \`IDX_sync_runs_property_started\` ON \`sync_runs\``);
        await queryRunner.query(`DROP TABLE \`sync_runs\``);
        await queryRunner.query(`DROP INDEX \`UQ_top_rows_period_dimension_key\` ON \`top_rows\``);
        await queryRunner.query(`DROP INDEX \`IDX_top_rows_lookup\` ON \`top_rows\``);
        await queryRunner.query(`DROP TABLE \`top_rows\``);
        await queryRunner.query(`DROP INDEX \`UQ_daily_metrics_property_date\` ON \`daily_metrics\``);
        await queryRunner.query(`DROP TABLE \`daily_metrics\``);
    }

}
