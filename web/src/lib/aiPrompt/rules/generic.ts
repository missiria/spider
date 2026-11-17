import type { RuleTemplate } from "./types";

/** Used when Spider adds a rule this file set does not know yet. */
export const generic: RuleTemplate = {
  en: {
    points: [
      "What the evidence shows and what it cannot show.",
      "The most likely causes, with the check that confirms each.",
      "The steps to take, in order.",
      "What to re-measure and when.",
    ],
    brief: [
      "Say which page the brief is for and why that page.",
      "List the content changes the evidence supports.",
    ],
  },
  fr: {
    points: [
      "Ce que les preuves montrent et ce qu’elles ne peuvent pas montrer.",
      "Les causes les plus probables, avec la vérification qui confirme chacune.",
      "Les étapes à suivre, dans l’ordre.",
      "Ce qu’il faut remesurer et quand.",
    ],
    brief: [
      "Indique pour quelle page est le brief et pourquoi cette page.",
      "Liste les modifications de contenu que les preuves justifient.",
    ],
  },
};
