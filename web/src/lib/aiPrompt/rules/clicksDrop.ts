import type { RuleTemplate } from "./types";

export const clicksDrop: RuleTemplate = {
  en: {
    points: [
      "Likely causes to rule in or out: seasonality, lost rankings, SERP layout change, technical fault (status code, canonical, noindex), tracking gap.",
      "The checks to run first in Search Console and on the site, in order.",
      "How to tell a demand change from a ranking loss with the data available.",
      "Recovery steps for the most likely cause.",
      "The click level that counts as recovered and when to compare.",
    ],
    brief: [
      "Only write a brief if the drop points to content that lost relevance; otherwise say that a content brief is not the right fix and why.",
      "List what to refresh on the affected page or pages.",
    ],
  },
  fr: {
    points: [
      "Causes probables à confirmer ou écarter : saisonnalité, perte de positions, changement de mise en page de la SERP, défaut technique (code HTTP, canonical, noindex), trou de mesure.",
      "Les vérifications à faire en premier dans Search Console et sur le site, dans l’ordre.",
      "Comment distinguer une baisse de la demande d’une perte de position avec les données disponibles.",
      "Étapes de récupération pour la cause la plus probable.",
      "Le niveau de clics qui vaut récupération et le moment de la comparaison.",
    ],
    brief: [
      "Ne rédige un brief que si la baisse indique un contenu devenu moins pertinent ; sinon, dis qu’un brief de contenu n’est pas la bonne réponse et pourquoi.",
      "Liste ce qu’il faut rafraîchir sur la ou les pages concernées.",
    ],
  },
};
