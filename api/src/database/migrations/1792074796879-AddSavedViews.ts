import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSavedViews1792074796879 implements MigrationInterface {
    name = 'AddSavedViews1792074796879'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`saved_views\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`user_id\` int NOT NULL, \`scope\` enum ('fleet', 'property') NOT NULL, \`property_id\` int NULL, \`name\` varchar(120) NOT NULL, \`config\` text NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_saved_views_lookup\` (\`workspace_id\`, \`scope\`, \`property_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_saved_views_lookup\` ON \`saved_views\``);
        await queryRunner.query(`DROP TABLE \`saved_views\``);
    }

}
