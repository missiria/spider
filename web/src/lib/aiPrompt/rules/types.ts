import type { PromptLang } from "../strings";

/**
 * Rule-specific points appended to the closing instructions, so the assistant asks the
 * right questions for each kind of opportunity. `brief` replaces `points` in the
 * content-brief variant.
 */
export type RuleTemplate = Record<
  PromptLang,
  { points: string[]; brief: string[] }
>;
