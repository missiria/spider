import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDimensionMetrics1792073897155 implements MigrationInterface {
    name = 'AddDimensionMetrics1792073897155'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`dimension_metrics\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`property_id\` int NOT NULL, \`date\` date NOT NULL, \`dimension\` enum ('query', 'page', 'country', 'device', 'search_appearance') NOT NULL, \`key_text\` varchar(2048) NOT NULL, \`key_hash\` char(32) NOT NULL, \`clicks\` int UNSIGNED NOT NULL, \`impressions\` int UNSIGNED NOT NULL, \`ctr\` double NOT NULL, \`position\` double NOT NULL, INDEX \`IDX_dimension_metrics_lookup\` (\`property_id\`, \`dimension\`, \`date\`), UNIQUE INDEX \`UQ_dimension_metrics_row\` (\`property_id\`, \`date\`, \`dimension\`, \`key_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`sync_runs\` ADD \`details\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`dimension_metrics\` ADD CONSTRAINT \`FK_59fc0f84d611014ce86c49e5bd0\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`dimension_metrics\` DROP FOREIGN KEY \`FK_59fc0f84d611014ce86c49e5bd0\``);
        await queryRunner.query(`ALTER TABLE \`sync_runs\` DROP COLUMN \`details\``);
        await queryRunner.query(`DROP INDEX \`UQ_dimension_metrics_row\` ON \`dimension_metrics\``);
        await queryRunner.query(`DROP INDEX \`IDX_dimension_metrics_lookup\` ON \`dimension_metrics\``);
        await queryRunner.query(`DROP TABLE \`dimension_metrics\``);
    }

}
