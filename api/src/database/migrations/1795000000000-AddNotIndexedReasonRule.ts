import { MigrationInterface, QueryRunner } from 'typeorm';

/** MISS-0194: opportunities from the live "Why pages aren't indexed" reasons. */
export class AddNotIndexedReasonRule1795000000000 implements MigrationInterface {
  name = 'AddNotIndexedReasonRule1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`opportunities\` CHANGE \`rule\` \`rule\` enum ('clicks_drop', 'impressions_drop', 'low_ctr', 'near_page_one', 'cannibalization', 'indexing_new_reason', 'indexing_spike', 'indexed_drop', 'submitted_not_indexed', 'indexing_persistent', 'not_indexed_reason') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`opportunity_events\` WHERE \`opportunity_id\` IN (SELECT \`id\` FROM \`opportunities\` WHERE \`rule\` = 'not_indexed_reason')`,
    );
    await queryRunner.query(
      `DELETE FROM \`opportunities\` WHERE \`rule\` = 'not_indexed_reason'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunities\` CHANGE \`rule\` \`rule\` enum ('clicks_drop', 'impressions_drop', 'low_ctr', 'near_page_one', 'cannibalization', 'indexing_new_reason', 'indexing_spike', 'indexed_drop', 'submitted_not_indexed', 'indexing_persistent') NOT NULL`,
    );
  }
}
