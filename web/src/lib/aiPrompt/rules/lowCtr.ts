import type { RuleTemplate } from "./types";

export const lowCtr: RuleTemplate = {
  en: {
    points: [
      "Why the result gets few clicks at this position: title, description, intent mismatch or a SERP feature above it.",
      "Two or three rewritten title tags and meta descriptions to test.",
      "Structured data or rich results that could apply.",
      "Whether the page ranking is the right one for the query.",
      "The CTR to aim for at this position and when to compare.",
    ],
    brief: [
      "Focus on the promise made in the snippet: title tag, meta description and the first screen of the page.",
      "Keep the page's existing ranking signals; say what must not change.",
    ],
  },
  fr: {
    points: [
      "Pourquoi le résultat reçoit peu de clics à cette position : title, description, décalage d’intention ou fonctionnalité de SERP placée au-dessus.",
      "Deux ou trois balises title et meta descriptions réécrites à tester.",
      "Données structurées ou résultats enrichis applicables.",
      "Si la page positionnée est la bonne pour la requête.",
      "Le CTR à viser à cette position et le moment de la comparaison.",
    ],
    brief: [
      "Concentre-toi sur la promesse de l’extrait : balise title, meta description et premier écran de la page.",
      "Conserve les signaux de positionnement existants de la page ; précise ce qui ne doit pas changer.",
    ],
  },
};
