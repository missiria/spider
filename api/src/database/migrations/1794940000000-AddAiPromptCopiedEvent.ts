import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MISS-0190: opportunity_events.type gains 'ai_prompt_copied', the history line written when
 * a user copies the AI prompt of an opportunity. Additive: older builds never write it.
 */
export class AddAiPromptCopiedEvent1794940000000 implements MigrationInterface {
  name = 'AddAiPromptCopiedEvent1794940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`opportunity_events\` MODIFY \`type\` enum ('created', 'evidence_updated', 'status', 'priority', 'assignee', 'due_date', 'note', 'ai_prompt_copied') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`opportunity_events\` WHERE \`type\` = 'ai_prompt_copied'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`opportunity_events\` MODIFY \`type\` enum ('created', 'evidence_updated', 'status', 'priority', 'assignee', 'due_date', 'note') NOT NULL`,
    );
  }
}
