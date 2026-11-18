import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MITP-0833 (ADR-0009): Page indexing.
 *  - indexing_imports / indexing_reasons / indexing_trend / indexing_examples: Search Console
 *    Page indexing exports uploaded by an operator (the API has no endpoint for this report)
 *  - tracked_urls / url_inspections: URL Inspection API inventory and per-call history
 *  - gsc_sitemaps: Sitemaps API snapshots; gsc_quota_usage: daily call counters
 *  - sync_runs.kind gains 'indexing'; opportunities.rule gains the 5 indexing rules
 * Hand-trimmed from a generated diff: unrelated schema drift is intentionally not included.
 */
export class AddPageIndexing1794953109805 implements MigrationInterface {
  name = 'AddPageIndexing1794953109805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`url_inspections\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`url\` varchar(2048) NOT NULL, \`url_hash\` char(32) NOT NULL, \`inspected_at\` timestamp NOT NULL, \`verdict\` varchar(32) NULL, \`coverage_state\` varchar(255) NULL, \`indexing_state\` varchar(64) NULL, \`robots_txt_state\` varchar(64) NULL, \`page_fetch_state\` varchar(64) NULL, \`crawled_as\` varchar(32) NULL, \`last_crawl_time\` timestamp NULL, \`google_canonical\` varchar(2048) NULL, \`user_canonical\` varchar(2048) NULL, \`sitemaps\` text NULL, \`referring_urls\` text NULL, \`raw\` mediumtext NULL, \`error\` text NULL, INDEX \`IDX_url_inspections_latest\` (\`property_id\`, \`url_hash\`, \`inspected_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`tracked_urls\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`url\` varchar(2048) NOT NULL, \`url_hash\` char(32) NOT NULL, \`in_sitemap\` tinyint NOT NULL DEFAULT 0, \`sitemap\` varchar(2048) NULL, \`in_gsc_pages\` tinyint NOT NULL DEFAULT 0, \`impressions_28d\` int UNSIGNED NOT NULL DEFAULT '0', \`user_added\` tinyint NOT NULL DEFAULT 0, \`last_seen_in_source\` timestamp NULL, \`last_inspected_at\` timestamp NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_tracked_urls_queue\` (\`property_id\`, \`last_inspected_at\`), UNIQUE INDEX \`UQ_tracked_urls_url\` (\`property_id\`, \`url_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`indexing_imports\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`uploaded_by\` int NULL, \`filename\` varchar(255) NOT NULL, \`report_kind\` enum ('overview', 'issue') NOT NULL, \`scope\` enum ('all_known', 'submitted', 'sitemap') NOT NULL DEFAULT 'all_known', \`scope_detail\` varchar(2048) NULL, \`scope_hash\` char(32) NOT NULL, \`issue_reason\` varchar(512) NULL, \`issue_reason_hash\` char(32) NULL, \`report_date\` date NOT NULL, \`reason_rows\` int UNSIGNED NOT NULL DEFAULT '0', \`trend_rows\` int UNSIGNED NOT NULL DEFAULT '0', \`example_rows\` int UNSIGNED NOT NULL DEFAULT '0', \`examples_partial\` tinyint NOT NULL DEFAULT 0, \`metadata_raw\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_indexing_imports_property\` (\`property_id\`, \`scope\`, \`report_date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`indexing_trend\` (\`id\` int NOT NULL AUTO_INCREMENT, \`import_id\` int NOT NULL, \`property_id\` int NOT NULL, \`date\` date NOT NULL, \`indexed\` int UNSIGNED NULL, \`not_indexed\` int UNSIGNED NULL, \`impressions\` int UNSIGNED NULL, INDEX \`IDX_indexing_trend_import\` (\`import_id\`, \`date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`indexing_reasons\` (\`id\` int NOT NULL AUTO_INCREMENT, \`import_id\` int NOT NULL, \`property_id\` int NOT NULL, \`scope\` enum ('all_known', 'submitted', 'sitemap') NOT NULL, \`scope_hash\` char(32) NOT NULL, \`report_date\` date NOT NULL, \`reason\` varchar(512) NOT NULL, \`reason_hash\` char(32) NOT NULL, \`source\` varchar(64) NULL, \`reason_group\` enum ('not_indexed', 'indexed', 'improvement') NOT NULL, \`validation\` varchar(64) NULL, \`pages\` int UNSIGNED NOT NULL, INDEX \`IDX_indexing_reasons_import\` (\`import_id\`), INDEX \`IDX_indexing_reasons_lookup\` (\`property_id\`, \`scope_hash\`, \`reason_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`indexing_examples\` (\`id\` int NOT NULL AUTO_INCREMENT, \`import_id\` int NOT NULL, \`property_id\` int NOT NULL, \`reason_hash\` char(32) NOT NULL, \`url\` varchar(2048) NOT NULL, \`last_crawled\` date NULL, INDEX \`IDX_indexing_examples_reason\` (\`property_id\`, \`reason_hash\`), INDEX \`IDX_indexing_examples_import\` (\`import_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`gsc_quota_usage\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`api\` varchar(32) NOT NULL, \`date\` date NOT NULL, \`calls\` int UNSIGNED NOT NULL DEFAULT '0', UNIQUE INDEX \`UQ_gsc_quota_usage\` (\`property_id\`, \`api\`, \`date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`gsc_sitemaps\` (\`id\` int NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`path\` varchar(2048) NOT NULL, \`fetched_at\` timestamp NOT NULL, \`last_submitted\` timestamp NULL, \`last_downloaded\` timestamp NULL, \`is_pending\` tinyint NOT NULL DEFAULT 0, \`is_sitemaps_index\` tinyint NOT NULL DEFAULT 0, \`warnings\` int UNSIGNED NOT NULL DEFAULT '0', \`errors\` int UNSIGNED NOT NULL DEFAULT '0', \`contents\` text NULL, \`urls_read\` int UNSIGNED NULL, \`urls_truncated\` tinyint NOT NULL DEFAULT 0, \`fetch_error\` text NULL, INDEX \`IDX_gsc_sitemaps_property\` (\`property_id\`, \`fetched_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sync_runs\` CHANGE \`kind\` \`kind\` enum ('backfill', 'incremental', 'top', 'indexing') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunities\` CHANGE \`rule\` \`rule\` enum ('clicks_drop', 'impressions_drop', 'low_ctr', 'near_page_one', 'cannibalization', 'indexing_new_reason', 'indexing_spike', 'indexed_drop', 'submitted_not_indexed', 'indexing_persistent') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`url_inspections\` ADD CONSTRAINT \`FK_0dd21f228a4f757eb837901ee64\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tracked_urls\` ADD CONSTRAINT \`FK_272a0809ec71de10fc0ca7a070e\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_imports\` ADD CONSTRAINT \`FK_4c896da7ecffc153636ad8c8af3\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_trend\` ADD CONSTRAINT \`FK_7d3d35bf595303d54ff2981e27a\` FOREIGN KEY (\`import_id\`) REFERENCES \`indexing_imports\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_reasons\` ADD CONSTRAINT \`FK_3903f342ff07e0dfd97bf2aefb8\` FOREIGN KEY (\`import_id\`) REFERENCES \`indexing_imports\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_reasons\` ADD CONSTRAINT \`FK_c9dce42580ae039369aec03662b\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_examples\` ADD CONSTRAINT \`FK_dbf5eea7cc5b0e9bda6651e1996\` FOREIGN KEY (\`import_id\`) REFERENCES \`indexing_imports\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`gsc_sitemaps\` ADD CONSTRAINT \`FK_df257da8f73983f528c9dc0626e\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`gsc_sitemaps\` DROP FOREIGN KEY \`FK_df257da8f73983f528c9dc0626e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_examples\` DROP FOREIGN KEY \`FK_dbf5eea7cc5b0e9bda6651e1996\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_reasons\` DROP FOREIGN KEY \`FK_c9dce42580ae039369aec03662b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_reasons\` DROP FOREIGN KEY \`FK_3903f342ff07e0dfd97bf2aefb8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_trend\` DROP FOREIGN KEY \`FK_7d3d35bf595303d54ff2981e27a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`indexing_imports\` DROP FOREIGN KEY \`FK_4c896da7ecffc153636ad8c8af3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tracked_urls\` DROP FOREIGN KEY \`FK_272a0809ec71de10fc0ca7a070e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`url_inspections\` DROP FOREIGN KEY \`FK_0dd21f228a4f757eb837901ee64\``,
    );
    await queryRunner.query(
      `DELETE FROM \`opportunity_events\` WHERE \`opportunity_id\` IN (SELECT \`id\` FROM \`opportunities\` WHERE \`rule\` IN ('indexing_new_reason','indexing_spike','indexed_drop','submitted_not_indexed','indexing_persistent'))`,
    );
    await queryRunner.query(
      `DELETE FROM \`opportunities\` WHERE \`rule\` IN ('indexing_new_reason','indexing_spike','indexed_drop','submitted_not_indexed','indexing_persistent')`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunities\` CHANGE \`rule\` \`rule\` enum ('clicks_drop', 'impressions_drop', 'low_ctr', 'near_page_one', 'cannibalization') NOT NULL`,
    );
    await queryRunner.query(
      `DELETE FROM \`sync_runs\` WHERE \`kind\` = 'indexing'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sync_runs\` CHANGE \`kind\` \`kind\` enum ('backfill', 'incremental', 'top') NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE \`indexing_examples\``);
    await queryRunner.query(`DROP TABLE \`indexing_trend\``);
    await queryRunner.query(`DROP TABLE \`indexing_reasons\``);
    await queryRunner.query(`DROP TABLE \`indexing_imports\``);
    await queryRunner.query(`DROP TABLE \`url_inspections\``);
    await queryRunner.query(`DROP TABLE \`tracked_urls\``);
    await queryRunner.query(`DROP TABLE \`gsc_sitemaps\``);
    await queryRunner.query(`DROP TABLE \`gsc_quota_usage\``);
  }
}
