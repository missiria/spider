import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportsAndIntegrations1792080040557 implements MigrationInterface {
  name = 'AddReportsAndIntegrations1792080040557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`report_deliveries\` (\`id\` int NOT NULL AUTO_INCREMENT, \`schedule_id\` int NOT NULL, \`period_key\` varchar(16) NOT NULL, \`status\` enum ('sent', 'failed', 'skipped') NOT NULL, \`recipients\` text NOT NULL, \`subject\` varchar(255) NULL, \`error\` text NULL, \`attempts\` int UNSIGNED NOT NULL DEFAULT '1', \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_report_deliveries_period\` (\`schedule_id\`, \`period_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`reports\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`created_by\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`scope\` enum ('fleet', 'property') NOT NULL, \`property_id\` int NULL, \`config\` text NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_reports_workspace\` (\`workspace_id\`, \`scope\`, \`property_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`report_schedules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`report_id\` int NOT NULL, \`frequency\` enum ('weekly', 'monthly') NOT NULL, \`day\` tinyint UNSIGNED NOT NULL DEFAULT '1', \`hour\` tinyint UNSIGNED NOT NULL DEFAULT '7', \`recipients\` text NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`next_run_at\` timestamp NULL, \`last_run_at\` timestamp NULL, \`last_status\` varchar(16) NULL, \`last_error\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_report_schedules_due\` (\`enabled\`, \`next_run_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`webhook_deliveries\` (\`id\` int NOT NULL AUTO_INCREMENT, \`webhook_id\` int NOT NULL, \`event\` varchar(64) NOT NULL, \`dedupe_key\` varchar(191) NOT NULL, \`payload\` text NOT NULL, \`status\` enum ('pending', 'ok', 'failed') NOT NULL DEFAULT 'pending', \`attempts\` int UNSIGNED NOT NULL DEFAULT '0', \`response_status\` int NULL, \`error\` text NULL, \`next_attempt_at\` timestamp NULL, \`delivered_at\` timestamp NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_webhook_deliveries_pending\` (\`status\`, \`next_attempt_at\`), UNIQUE INDEX \`UQ_webhook_deliveries_dedupe\` (\`webhook_id\`, \`dedupe_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`webhooks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`url\` varchar(2048) NOT NULL, \`secret\` varchar(128) NOT NULL, \`events\` text NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`last_status\` varchar(16) NULL, \`last_delivery_at\` timestamp NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_webhooks_workspace\` (\`workspace_id\`, \`enabled\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`alert_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`channel\` enum ('email', 'webhook') NOT NULL, \`target\` text NOT NULL, \`config\` text NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`last_fired_at\` timestamp NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_alert_rules_workspace\` (\`workspace_id\`, \`enabled\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`alert_events\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`rule_id\` int NOT NULL, \`dedupe_key\` varchar(191) NOT NULL, \`kind\` varchar(64) NOT NULL, \`title\` varchar(255) NOT NULL, \`payload\` text NOT NULL, \`status\` enum ('sent', 'failed', 'skipped') NOT NULL, \`error\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_alert_events_list\` (\`workspace_id\`, \`created_at\`), UNIQUE INDEX \`UQ_alert_events_dedupe\` (\`rule_id\`, \`dedupe_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`workspaces\` ADD \`brand\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`report_deliveries\` ADD CONSTRAINT \`FK_a000d9873a252e2eb628330aff1\` FOREIGN KEY (\`schedule_id\`) REFERENCES \`report_schedules\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`report_schedules\` ADD CONSTRAINT \`FK_1dccfc2d17645280bbf6e851cfe\` FOREIGN KEY (\`report_id\`) REFERENCES \`reports\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`webhook_deliveries\` ADD CONSTRAINT \`FK_a0286aeb96db651efd1ae2966f2\` FOREIGN KEY (\`webhook_id\`) REFERENCES \`webhooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`webhook_deliveries\` DROP FOREIGN KEY \`FK_a0286aeb96db651efd1ae2966f2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`report_schedules\` DROP FOREIGN KEY \`FK_1dccfc2d17645280bbf6e851cfe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`report_deliveries\` DROP FOREIGN KEY \`FK_a000d9873a252e2eb628330aff1\``,
    );
    await queryRunner.query(`ALTER TABLE \`workspaces\` DROP COLUMN \`brand\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_alert_events_dedupe\` ON \`alert_events\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_alert_events_list\` ON \`alert_events\``,
    );
    await queryRunner.query(`DROP TABLE \`alert_events\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_alert_rules_workspace\` ON \`alert_rules\``,
    );
    await queryRunner.query(`DROP TABLE \`alert_rules\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_webhooks_workspace\` ON \`webhooks\``,
    );
    await queryRunner.query(`DROP TABLE \`webhooks\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_webhook_deliveries_dedupe\` ON \`webhook_deliveries\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_webhook_deliveries_pending\` ON \`webhook_deliveries\``,
    );
    await queryRunner.query(`DROP TABLE \`webhook_deliveries\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_report_schedules_due\` ON \`report_schedules\``,
    );
    await queryRunner.query(`DROP TABLE \`report_schedules\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_reports_workspace\` ON \`reports\``,
    );
    await queryRunner.query(`DROP TABLE \`reports\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_report_deliveries_period\` ON \`report_deliveries\``,
    );
    await queryRunner.query(`DROP TABLE \`report_deliveries\``);
  }
}
