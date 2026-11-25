/**
 * "Opportunity marked done" email (MISS-0198): pure rendering, unit-tested. Same text
 * conventions as the weekly digest (digest.ts): blank-line paragraphs, "Label: value" facts
 * and HTTPS links to APP_PUBLIC_URL, which MailerService → renderEmail turns into the
 * branded layout.
 */
import type { OpportunityPriority } from './entities/opportunity.entity';

export interface DoneNotificationInput {
  id: number;
  title: string;
  property_name: string;
  rule: string;
  priority: OpportunityPriority;
  key_text: string;
  actor_name: string;
  workspace_name: string;
  completed_at: Date;
  note?: string | null;
  publicUrl: string;
}

const NOTE_MAX = 600;
const TITLE_MAX = 140;

function oneLine(value: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function label(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function ruleLabel(rule: string): string {
  return label(rule.replace(/_/g, ' '));
}

function when(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function renderDoneNotification(input: DoneNotificationInput): {
  subject: string;
  text: string;
} {
  const base = input.publicUrl.replace(/\/$/, '');
  const actor = oneLine(input.actor_name) || 'A teammate';
  const title = clip(oneLine(input.title), TITLE_MAX);
  const facts = [
    `Opportunity: ${title}`,
    `Property: ${oneLine(input.property_name)}`,
    `Rule: ${ruleLabel(input.rule)}`,
    `Priority: ${label(input.priority)}`,
  ];
  const subjectKey = oneLine(input.key_text);
  if (subjectKey) facts.push(`Subject: ${clip(subjectKey, 200)}`);
  facts.push(`Marked done by: ${actor}`, `When: ${when(input.completed_at)}`);

  const paragraphs = [
    `${actor} marked an opportunity as done in ${oneLine(input.workspace_name)}.`,
    facts.join('\n'),
  ];
  const note = oneLine(input.note ?? '');
  if (note) paragraphs.push(`Note: ${clip(note, NOTE_MAX)}`);
  paragraphs.push(
    `Spider tracks the impact for 14 days after completion on the opportunity page.`,
    [
      `Open the opportunity → ${base}/opportunities/${input.id}`,
      `Opportunity Inbox → ${base}/opportunities`,
    ].join('\n'),
    'You receive this email as a member of this workspace.',
  );
  return {
    subject: `Done: ${clip(title, 90)}`,
    text: paragraphs.join('\n\n'),
  };
}
