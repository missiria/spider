import { formatDate } from "../format";
import type { OpportunityDetail, PropertyRow } from "../types";
import { evidenceLines } from "./evidence";
import { ruleTemplate } from "./rules";
import { STRINGS, type PromptLang, type PromptVariant } from "./strings";

export {
  LANG_LABELS,
  PROMPT_LANGS,
  PROMPT_VARIANTS,
  VARIANT_LABELS,
  type PromptLang,
  type PromptVariant,
} from "./strings";

export interface PromptOptions {
  variant: PromptVariant;
  lang: PromptLang;
  /** user id → display name, for the assignee and note authors */
  users?: Map<number, string>;
  /** app origin, e.g. https://spider.missiria.dev; the Spider link is left out without it */
  origin?: string;
}

const NOTES_SHOWN = 3;

/** "https://www.example.com/" or "sc-domain:example.com" → "www.example.com" / "example.com" */
export function propertyDomain(siteUrl: string): string {
  return siteUrl
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/** Same search as "View in Google" on the opportunity page. */
export function googleQueryUrl(siteUrl: string, query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${propertyDomain(siteUrl)} "${query}"`)}`;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Plain-text / Markdown prompt describing one opportunity, to paste into an AI assistant
 * (MISS-0190). Pure: built only from what the opportunity page already shows, so it never
 * carries workspace ids, fingerprints or credentials.
 */
export function buildOpportunityPrompt(
  o: OpportunityDetail,
  property: Pick<PropertyRow, "display_name" | "site_url"> | null | undefined,
  { variant, lang, users, origin }: PromptOptions,
): string {
  const s = STRINGS[lang];
  const f = s.fields;
  const h = s.headings;
  const name = (id: number) => users?.get(id) ?? `user #${id}`;
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    if (body.length) lines.push("", `## ${title}`, ...body);
  };

  lines.push(s.role[variant], s.dataOnly, s.answerLanguage);

  // ---- facts ---------------------------------------------------------------
  const facts = [`- ${f.title}: ${oneLine(o.title)}`];
  if (property) {
    const domain = propertyDomain(property.site_url);
    facts.push(
      `- ${f.property}: ${
        property.display_name && property.display_name !== domain
          ? `${oneLine(property.display_name)} (${domain})`
          : domain
      }`,
    );
  }
  facts.push(
    `- ${f.rule}: ${(s.rules as Record<string, string>)[o.rule] ?? `${s.unknownRule} (${o.rule})`}`,
  );
  if (o.subject === "query") facts.push(`- ${f.query}: "${o.key_text}"`);
  else if (o.subject === "page") facts.push(`- ${f.page}: ${o.key_text}`);
  else facts.push(`- ${f.scope}: ${f.wholeProperty}`);
  facts.push(
    `- ${f.priority}: ${s.priorities[o.priority] ?? o.priority}`,
    `- ${f.status}: ${s.statuses[o.status] ?? o.status}`,
    `- ${f.confidence}: ${s.confidences[o.confidence] ?? o.confidence}`,
    `- ${f.score}: ${o.score}/100`,
    s.sourceNote,
  );
  section(h.opportunity, facts);

  if (o.reason?.trim()) section(h.why, [o.reason.trim()]);
  if (o.suggested_action?.trim())
    section(h.suggested, [o.suggested_action.trim()]);
  section(h.evidence, evidenceLines(o.evidence ?? {}, s));

  // ---- tracking ------------------------------------------------------------
  const tracking: string[] = [];
  if (o.first_seen_at)
    tracking.push(`- ${f.firstSeen}: ${formatDate(o.first_seen_at)}`);
  if (o.last_seen_at)
    tracking.push(`- ${f.lastSeen}: ${formatDate(o.last_seen_at)}`);
  if (o.assignee_id) tracking.push(`- ${f.assignee}: ${name(o.assignee_id)}`);
  if (o.due_date) tracking.push(`- ${f.dueDate}: ${o.due_date}`);
  const notes = (o.events ?? [])
    .filter(
      (e) =>
        e.type === "note" &&
        typeof e.payload?.text === "string" &&
        e.payload.text.trim(),
    )
    .slice(-NOTES_SHOWN)
    .reverse();
  if (notes.length) {
    tracking.push(`- ${f.notes}:`);
    for (const n of notes) {
      tracking.push(
        `  - ${formatDate(n.created_at)}, ${n.user_id ? name(n.user_id) : f.scanner}: ${oneLine(String(n.payload?.text))}`,
      );
    }
  }
  section(h.tracking, tracking);

  // ---- links ---------------------------------------------------------------
  const links: string[] = [];
  if (origin)
    links.push(
      `- ${f.spiderLink}: ${origin.replace(/\/+$/, "")}/opportunities/${o.id}`,
    );
  if (o.subject === "query" && property)
    links.push(
      `- ${f.googleLink}: ${googleQueryUrl(property.site_url, o.key_text)}`,
    );
  if (o.subject === "page") links.push(`- ${f.pageLink}: ${o.key_text}`);
  section(h.links, links);

  // ---- ask -----------------------------------------------------------------
  const template = ruleTemplate(o.rule)[lang];
  const points = variant === "brief" ? template.brief : template.points;
  section(h.ask, [
    ...s.format[variant].map((item, i) => `${i + 1}. ${item}`),
    "",
    s.pointsIntro[variant],
    ...points.map((p) => `- ${p}`),
  ]);

  return lines.join("\n") + "\n";
}
