import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOpportunities1792075666798 implements MigrationInterface {
    name = 'AddOpportunities1792075666798'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`opportunity_events\` (\`id\` int NOT NULL AUTO_INCREMENT, \`opportunity_id\` int NOT NULL, \`user_id\` int NULL, \`type\` enum ('created', 'evidence_updated', 'status', 'priority', 'assignee', 'due_date', 'note') NOT NULL, \`payload\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_opportunity_events_opp\` (\`opportunity_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`opportunities\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`property_id\` int NOT NULL, \`rule\` enum ('clicks_drop', 'impressions_drop', 'low_ctr', 'near_page_one', 'cannibalization') NOT NULL, \`subject\` enum ('property', 'page', 'query') NOT NULL, \`key_text\` varchar(2048) NOT NULL, \`fingerprint\` char(32) NOT NULL, \`status\` enum ('open', 'in_progress', 'done', 'dismissed') NOT NULL DEFAULT 'open', \`priority\` enum ('low', 'medium', 'high') NOT NULL DEFAULT 'medium', \`score\` int UNSIGNED NOT NULL DEFAULT '0', \`confidence\` enum ('low', 'medium', 'high') NOT NULL DEFAULT 'medium', \`title\` varchar(255) NOT NULL, \`reason\` text NOT NULL, \`suggested_action\` text NOT NULL, \`evidence\` text NOT NULL, \`assignee_id\` int NULL, \`due_date\` date NULL, \`completed_at\` timestamp NULL, \`dismissed_at\` timestamp NULL, \`first_seen_at\` timestamp NOT NULL, \`last_seen_at\` timestamp NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_opportunities_list\` (\`workspace_id\`, \`status\`, \`property_id\`), UNIQUE INDEX \`UQ_opportunities_fingerprint\` (\`workspace_id\`, \`fingerprint\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`opportunity_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workspace_id\` int NOT NULL, \`config\` text NOT NULL, \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_38273e274b56dda74be13a5891\` (\`workspace_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`opportunity_events\` ADD CONSTRAINT \`FK_3f9164faf39e286b32a08c0103d\` FOREIGN KEY (\`opportunity_id\`) REFERENCES \`opportunities\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`opportunities\` ADD CONSTRAINT \`FK_21a2769bd69ab7d6dd30810dcee\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`opportunities\` DROP FOREIGN KEY \`FK_21a2769bd69ab7d6dd30810dcee\``);
        await queryRunner.query(`ALTER TABLE \`opportunity_events\` DROP FOREIGN KEY \`FK_3f9164faf39e286b32a08c0103d\``);
        await queryRunner.query(`DROP INDEX \`IDX_38273e274b56dda74be13a5891\` ON \`opportunity_rules\``);
        await queryRunner.query(`DROP TABLE \`opportunity_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_opportunities_fingerprint\` ON \`opportunities\``);
        await queryRunner.query(`DROP INDEX \`IDX_opportunities_list\` ON \`opportunities\``);
        await queryRunner.query(`DROP TABLE \`opportunities\``);
        await queryRunner.query(`DROP INDEX \`IDX_opportunity_events_opp\` ON \`opportunity_events\``);
        await queryRunner.query(`DROP TABLE \`opportunity_events\``);
    }

}
