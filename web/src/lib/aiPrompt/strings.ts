import type {
  OpportunityPriority,
  OpportunityRule,
  OpportunityStatus,
} from "../types";

export type PromptVariant = "explain" | "ticket" | "brief";
export type PromptLang = "en" | "fr";

export const PROMPT_VARIANTS: PromptVariant[] = ["explain", "ticket", "brief"];
export const PROMPT_LANGS: PromptLang[] = ["en", "fr"];

/** UI labels (the app itself is English only). */
export const VARIANT_LABELS: Record<PromptVariant, string> = {
  explain: "Explain + action plan",
  ticket: "Write a ticket",
  brief: "Content brief",
};

export const LANG_LABELS: Record<PromptLang, string> = {
  en: "English",
  fr: "Français",
};

export interface PromptStrings {
  role: Record<PromptVariant, string>;
  dataOnly: string;
  answerLanguage: string;
  sourceNote: string;
  headings: {
    opportunity: string;
    why: string;
    suggested: string;
    evidence: string;
    tracking: string;
    links: string;
    ask: string;
  };
  fields: {
    title: string;
    property: string;
    rule: string;
    query: string;
    page: string;
    scope: string;
    wholeProperty: string;
    priority: string;
    status: string;
    confidence: string;
    score: string;
    period: string;
    comparedWith: string;
    metric: string;
    current: string;
    previous: string;
    clicks: string;
    impressions: string;
    ctr: string;
    position: string;
    share: string;
    drop: string;
    potential: string;
    competing: string;
    queryImpressions: string;
    threshold: string;
    noEvidence: string;
    firstSeen: string;
    lastSeen: string;
    assignee: string;
    dueDate: string;
    notes: string;
    spiderLink: string;
    googleLink: string;
    pageLink: string;
    scanner: string;
  };
  rules: Record<OpportunityRule, string>;
  unknownRule: string;
  statuses: Record<OpportunityStatus, string>;
  priorities: Record<OpportunityPriority, string>;
  confidences: Record<"low" | "medium" | "high", string>;
  /** Output format asked from the assistant, per variant. */
  format: Record<PromptVariant, string[]>;
  /** Heading printed above the rule-specific points. */
  pointsIntro: Record<PromptVariant, string>;
}

export const STRINGS: Record<PromptLang, PromptStrings> = {
  en: {
    role: {
      explain:
        "You are a senior SEO analyst. Explain the opportunity below and propose a prioritized action plan.",
      ticket:
        "You are a senior SEO analyst working with a web team. Turn the opportunity below into one ready-to-file work ticket.",
      brief:
        "You are a senior SEO content strategist. Write a content brief for the page that should rank, based on the opportunity below.",
    },
    dataOnly:
      "Use only the data given here. When something you need is missing, say which data to check instead of guessing.",
    answerLanguage: "Answer in English.",
    sourceNote:
      "Source: MISSIRIA Spider, computed from Google Search Console data.",
    headings: {
      opportunity: "Opportunity",
      why: "Why this was flagged",
      suggested: "Suggested action (from Spider)",
      evidence: "Evidence",
      tracking: "Tracking",
      links: "Links",
      ask: "What I need from you",
    },
    fields: {
      title: "Title",
      property: "Property",
      rule: "Rule",
      query: "Query",
      page: "Page",
      scope: "Scope",
      wholeProperty: "Whole property",
      priority: "Priority",
      status: "Status",
      confidence: "Confidence",
      score: "Score",
      period: "Period",
      comparedWith: "compared with",
      metric: "Metric",
      current: "Current period",
      previous: "Previous period",
      clicks: "Clicks",
      impressions: "Impressions",
      ctr: "CTR",
      position: "Average position",
      share: "Share of impressions",
      drop: "Drop",
      potential:
        "Potential: about {n} extra clicks per period if CTR reached 3%.",
      competing: "Pages competing for this query",
      queryImpressions: "{n} impressions in total",
      threshold: "Threshold used",
      noEvidence: "No evidence data recorded.",
      firstSeen: "First seen",
      lastSeen: "Last seen",
      assignee: "Assignee",
      dueDate: "Due date",
      notes: "Latest notes",
      spiderLink: "Spider opportunity",
      googleLink: "Google results for this query on the site",
      pageLink: "Page",
      scanner: "Scanner",
    },
    rules: {
      clicks_drop: "Clicks drop",
      impressions_drop: "Impressions drop",
      low_ctr: "Low CTR",
      near_page_one: "Near page one",
      cannibalization: "Cannibalization",
    },
    unknownRule: "Other",
    statuses: {
      open: "Open",
      in_progress: "In progress",
      done: "Done",
      dismissed: "Dismissed",
    },
    priorities: { high: "High", medium: "Medium", low: "Low" },
    confidences: {
      high: "High",
      medium: "Medium",
      low: "Low (heuristic, needs human review)",
    },
    format: {
      explain: [
        "Diagnosis: what is most likely happening, and how sure the data lets you be.",
        "Which URL should rank for this (or which page to act on), and why.",
        "Concrete steps, ordered by expected impact and effort.",
        "Acceptance criteria that show the work is done.",
        "What to re-measure in Search Console, and when.",
      ],
      ticket: [
        "Title: one line, starting with the area in brackets, e.g. [SEO].",
        "Problem: two or three sentences in plain words.",
        "Evidence: the numbers above, kept exact, with the period.",
        "Tasks: a checklist of concrete steps, in order.",
        "Acceptance criteria: how to verify each result, including what to re-measure and when.",
        "Write it in Markdown with these five headings, ready to paste into a ticket tracker.",
      ],
      brief: [
        "Target page (the URL that should rank) and the search intent it must serve.",
        "Primary query and close variants to cover.",
        "Recommended title tag, meta description and H1.",
        "Outline: H2/H3 sections with what each must answer.",
        "Internal links to add (source pages and anchor wording).",
        "What to remove, merge or redirect from competing pages, if any.",
        "How to measure success: metric, target and date.",
      ],
    },
    pointsIntro: {
      explain: "Cover these points for this kind of opportunity:",
      ticket: "Make sure the tasks cover these points:",
      brief: "Take these points into account in the brief:",
    },
  },
  fr: {
    role: {
      explain:
        "Tu es un analyste SEO senior. Explique l’opportunité ci-dessous et propose un plan d’action priorisé.",
      ticket:
        "Tu es un analyste SEO senior qui travaille avec une équipe web. Transforme l’opportunité ci-dessous en un ticket de travail prêt à créer.",
      brief:
        "Tu es un stratège de contenu SEO senior. Rédige un brief de contenu pour la page qui doit se positionner, à partir de l’opportunité ci-dessous.",
    },
    dataOnly:
      "Utilise uniquement les données fournies ici. S’il te manque une information, indique quelle donnée vérifier au lieu de supposer.",
    answerLanguage:
      "Réponds en français. Les textes « Pourquoi » et « Action suggérée » sont fournis en anglais par l’outil.",
    sourceNote:
      "Source : MISSIRIA Spider, calculé à partir des données Google Search Console.",
    headings: {
      opportunity: "Opportunité",
      why: "Pourquoi elle a été signalée",
      suggested: "Action suggérée (par Spider)",
      evidence: "Preuves",
      tracking: "Suivi",
      links: "Liens",
      ask: "Ce que j’attends de toi",
    },
    fields: {
      title: "Titre",
      property: "Propriété",
      rule: "Règle",
      query: "Requête",
      page: "Page",
      scope: "Périmètre",
      wholeProperty: "Toute la propriété",
      priority: "Priorité",
      status: "Statut",
      confidence: "Confiance",
      score: "Score",
      period: "Période",
      comparedWith: "comparée à",
      metric: "Indicateur",
      current: "Période actuelle",
      previous: "Période précédente",
      clicks: "Clics",
      impressions: "Impressions",
      ctr: "CTR",
      position: "Position moyenne",
      share: "Part des impressions",
      drop: "Baisse",
      potential:
        "Potentiel : environ {n} clics supplémentaires par période si le CTR atteignait 3 %.",
      competing: "Pages en concurrence sur cette requête",
      queryImpressions: "{n} impressions au total",
      threshold: "Seuil utilisé",
      noEvidence: "Aucune donnée de preuve enregistrée.",
      firstSeen: "Première détection",
      lastSeen: "Dernière détection",
      assignee: "Responsable",
      dueDate: "Échéance",
      notes: "Dernières notes",
      spiderLink: "Opportunité dans Spider",
      googleLink: "Résultats Google pour cette requête sur le site",
      pageLink: "Page",
      scanner: "Scanner",
    },
    rules: {
      clicks_drop: "Baisse de clics",
      impressions_drop: "Baisse d’impressions",
      low_ctr: "CTR faible",
      near_page_one: "Proche de la première page",
      cannibalization: "Cannibalisation",
    },
    unknownRule: "Autre",
    statuses: {
      open: "Ouvert",
      in_progress: "En cours",
      done: "Terminé",
      dismissed: "Ignoré",
    },
    priorities: { high: "Haute", medium: "Moyenne", low: "Basse" },
    confidences: {
      high: "Élevée",
      medium: "Moyenne",
      low: "Faible (heuristique, à valider par un humain)",
    },
    format: {
      explain: [
        "Diagnostic : ce qui se passe le plus probablement, et le degré de certitude que permettent les données.",
        "Quelle URL doit se positionner (ou sur quelle page agir), et pourquoi.",
        "Étapes concrètes, classées par impact attendu et effort.",
        "Critères d’acceptation qui prouvent que le travail est fait.",
        "Ce qu’il faut remesurer dans Search Console, et quand.",
      ],
      ticket: [
        "Titre : une ligne, commençant par le domaine entre crochets, par exemple [SEO].",
        "Problème : deux ou trois phrases en langage simple.",
        "Preuves : les chiffres ci-dessus, exacts, avec la période.",
        "Tâches : une liste à cocher d’étapes concrètes, dans l’ordre.",
        "Critères d’acceptation : comment vérifier chaque résultat, y compris ce qu’il faut remesurer et quand.",
        "Rédige-le en Markdown avec ces cinq titres, prêt à coller dans un outil de tickets.",
      ],
      brief: [
        "Page cible (l’URL qui doit se positionner) et l’intention de recherche à satisfaire.",
        "Requête principale et variantes proches à couvrir.",
        "Balise title, meta description et H1 recommandés.",
        "Plan : sections H2/H3 avec ce que chacune doit traiter.",
        "Liens internes à ajouter (pages sources et texte d’ancre).",
        "Ce qu’il faut supprimer, fusionner ou rediriger parmi les pages concurrentes, le cas échéant.",
        "Comment mesurer le succès : indicateur, objectif et date.",
      ],
    },
    pointsIntro: {
      explain: "Traite ces points pour ce type d’opportunité :",
      ticket: "Assure-toi que les tâches couvrent ces points :",
      brief: "Tiens compte de ces points dans le brief :",
    },
  },
};
