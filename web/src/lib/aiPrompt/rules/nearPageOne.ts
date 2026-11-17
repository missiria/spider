import type { RuleTemplate } from "./types";

export const nearPageOne: RuleTemplate = {
  en: {
    points: [
      "Which page ranks for this query and whether it is the right one.",
      "On-page changes: title, H1, intro and sections that should cover the query.",
      "CTR: how the snippet could earn more clicks at the current position.",
      "Internal links to add, with anchor wording close to the query.",
      "Core Web Vitals or technical checks worth doing on that page.",
      "A realistic target position and the date to re-check it.",
    ],
    brief: [
      "Compare what the query asks for with what the ranking page covers today.",
      "List the gaps to fill to move from the current position into the first results.",
    ],
  },
  fr: {
    points: [
      "Quelle page se positionne sur cette requête et si c’est la bonne.",
      "Modifications on-page : title, H1, introduction et sections qui doivent couvrir la requête.",
      "CTR : comment l’extrait peut obtenir plus de clics à la position actuelle.",
      "Liens internes à ajouter, avec un texte d’ancre proche de la requête.",
      "Core Web Vitals ou contrôles techniques utiles sur cette page.",
      "Une position cible réaliste et la date à laquelle la revérifier.",
    ],
    brief: [
      "Compare ce que demande la requête avec ce que la page positionnée couvre aujourd’hui.",
      "Liste les manques à combler pour passer de la position actuelle aux premiers résultats.",
    ],
  },
};
