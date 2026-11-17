import type { RuleTemplate } from "./types";

export const impressionsDrop: RuleTemplate = {
  en: {
    points: [
      "Likely causes to rule in or out: de-indexed URLs, lost rankings, manual action or security issue, query-demand change.",
      "Indexing checks: Pages report, URL inspection, canonical, robots and sitemap.",
      "Which queries or pages to compare across both periods to locate the loss.",
      "Recovery steps for the most likely cause.",
      "The impression level that counts as recovered and when to compare.",
    ],
    brief: [
      "Only write a brief if the loss points to content that lost relevance; otherwise say that a content brief is not the right fix and why.",
      "List what to refresh on the affected page or pages.",
    ],
  },
  fr: {
    points: [
      "Causes probables à confirmer ou écarter : URL désindexées, perte de positions, action manuelle ou problème de sécurité, évolution de la demande.",
      "Contrôles d’indexation : rapport Pages, inspection d’URL, canonical, robots et sitemap.",
      "Quelles requêtes ou pages comparer entre les deux périodes pour localiser la perte.",
      "Étapes de récupération pour la cause la plus probable.",
      "Le niveau d’impressions qui vaut récupération et le moment de la comparaison.",
    ],
    brief: [
      "Ne rédige un brief que si la perte indique un contenu devenu moins pertinent ; sinon, dis qu’un brief de contenu n’est pas la bonne réponse et pourquoi.",
      "Liste ce qu’il faut rafraîchir sur la ou les pages concernées.",
    ],
  },
};
