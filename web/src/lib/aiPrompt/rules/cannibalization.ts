import type { RuleTemplate } from "./types";

export const cannibalization: RuleTemplate = {
  en: {
    points: [
      "Is this real cannibalization or intentional variants (languages, product sizes, different intents)?",
      "Which of the competing URLs should rank for the query, judged on share, clicks and position.",
      "For each other URL: consolidate (301 or canonical), differentiate the intent, or leave as is.",
      "Internal links and anchor texts to point at the chosen URL.",
      "Which position and share to expect on the chosen URL in the next window.",
    ],
    brief: [
      "Pick the one URL that should own the query and say why.",
      "State what makes its intent distinct from the other competing pages.",
      "List content to move in from the competing pages before they are merged or redirected.",
    ],
  },
  fr: {
    points: [
      "S’agit-il d’une vraie cannibalisation ou de variantes voulues (langues, tailles de produit, intentions différentes) ?",
      "Laquelle des URL en concurrence doit se positionner sur la requête, d’après la part, les clics et la position.",
      "Pour chaque autre URL : consolider (301 ou canonical), différencier l’intention, ou laisser en l’état.",
      "Liens internes et textes d’ancre à orienter vers l’URL retenue.",
      "Quelle position et quelle part attendre sur l’URL retenue dans la prochaine période.",
    ],
    brief: [
      "Choisis l’URL unique qui doit porter la requête et explique pourquoi.",
      "Précise ce qui distingue son intention de celle des autres pages en concurrence.",
      "Liste le contenu à reprendre des pages concurrentes avant leur fusion ou redirection.",
    ],
  },
};
