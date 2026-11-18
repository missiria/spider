import { cannibalization } from "./cannibalization";
import { clicksDrop } from "./clicksDrop";
import { generic } from "./generic";
import { impressionsDrop } from "./impressionsDrop";
import { indexing } from "./indexing";
import { lowCtr } from "./lowCtr";
import { nearPageOne } from "./nearPageOne";
import type { RuleTemplate } from "./types";

const TEMPLATES = new Map<string, RuleTemplate>([
  ["clicks_drop", clicksDrop],
  ["impressions_drop", impressionsDrop],
  ["low_ctr", lowCtr],
  ["near_page_one", nearPageOne],
  ["cannibalization", cannibalization],
  ["indexing_new_reason", indexing],
  ["indexing_spike", indexing],
  ["indexed_drop", indexing],
  ["submitted_not_indexed", indexing],
  ["indexing_persistent", indexing],
  ["not_indexed_reason", indexing],
]);

export function ruleTemplate(rule: string): RuleTemplate {
  return TEMPLATES.get(rule) ?? generic;
}
