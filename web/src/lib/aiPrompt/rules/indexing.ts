import type { RuleTemplate } from "./types";

/** Shared by the five Page indexing rules (MITP-0833). */
export const indexing: RuleTemplate = {
  en: {
    points: [
      "What this Google indexing reason means, and whether it is a defect or an intended exclusion for these URLs.",
      "The most likely causes on the site (status codes, redirects, canonicals, robots rules, noindex, internal links, sitemap entries, content quality), with the check that confirms each.",
      "What to do per group of example URLs: fix, redirect, remove from the sitemap, or leave as is.",
      "How to confirm the fix: URL Inspection on a few URLs, then “Validate fix” in Search Console, and how long Google usually takes.",
      "What the data cannot show: the export lists at most 1,000 example URLs, and URL Inspection reflects Google’s last crawl, not the live page.",
    ],
    brief: [
      "Only write a content brief when the reason is about content quality (crawled or discovered but not indexed, soft 404, duplicate); otherwise say that the fix is technical and list it.",
      "Say what would make the page worth indexing: unique content, internal links from indexed pages, one clear canonical.",
    ],
  },
  fr: {
    points: [
      "Ce que signifie ce motif d’indexation Google, et s’il s’agit d’un défaut ou d’une exclusion voulue pour ces URL.",
      "Les causes les plus probables sur le site (codes HTTP, redirections, canoniques, règles robots, noindex, liens internes, entrées de sitemap, qualité du contenu), avec la vérification qui confirme chacune.",
      "Que faire par groupe d’URL d’exemple : corriger, rediriger, retirer du sitemap ou laisser en l’état.",
      "Comment confirmer la correction : Inspection d’URL sur quelques URL, puis « Valider la correction » dans la Search Console, et le délai habituel côté Google.",
      "Ce que les données ne peuvent pas montrer : l’export liste au plus 1 000 URL d’exemple, et l’Inspection d’URL reflète la dernière exploration de Google, pas la page en direct.",
    ],
    brief: [
      "Ne rédige un brief de contenu que si le motif concerne la qualité du contenu (explorée ou détectée mais non indexée, soft 404, doublon) ; sinon indique que la correction est technique et liste-la.",
      "Précise ce qui rendrait la page digne d’être indexée : contenu unique, liens internes depuis des pages indexées, une canonique claire.",
    ],
  },
};
