import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0135: workspaces.brand_logo holds the approved report logo (JSON with base64 bytes,
 * ≤ 256 KB image) so PDFs can print it without a file path. The entity profile fields live in
 * the existing workspaces.brand JSON, no column needed.
 */
export class AddBrandLogo1792700000000 implements MigrationInterface {
  name = 'AddBrandLogo1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`workspaces\` ADD \`brand_logo\` mediumtext NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`workspaces\` DROP COLUMN \`brand_logo\``,
    );
  }
}
