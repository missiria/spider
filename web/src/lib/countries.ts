/** GSC reports countries as ISO-3166-1 alpha-3, lowercase. Names via Intl when the browser knows the alpha-2 code. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  fra: "FR", bel: "BE", esp: "ES", mar: "MA", can: "CA", che: "CH", deu: "DE", gbr: "GB", usa: "US", ita: "IT", prt: "PT", nld: "NL",
  lux: "LU", dza: "DZ", tun: "TN", sen: "SN", civ: "CI", cmr: "CM", mex: "MX", arg: "AR", col: "CO", chl: "CL", per: "PE", bra: "BR",
  pol: "PL", rou: "RO", mkd: "MK", tur: "TR", grc: "GR", aut: "AT", swe: "SE", nor: "NO", dnk: "DK", fin: "FI", irl: "IE", cze: "CZ",
  hun: "HU", svk: "SK", bgr: "BG", hrv: "HR", srb: "RS", ukr: "UA", rus: "RU", isr: "IL", are: "AE", sau: "SA", qat: "QA", egy: "EG",
  ind: "IN", pak: "PK", chn: "CN", jpn: "JP", kor: "KR", aus: "AU", nzl: "NZ", zaf: "ZA", nga: "NG", gha: "GH", ken: "KE", hti: "HT",
  dom: "DO", cub: "CU", ven: "VE", ecu: "EC", bol: "BO", ury: "UY", pry: "PY", gtm: "GT", pan: "PA", cri: "CR", mda: "MD", ltu: "LT",
  lva: "LV", est: "EE", svn: "SI", alb: "AL", bih: "BA", mne: "ME", cyp: "CY", mlt: "MT", isl: "IS", gab: "GA", cog: "CG", cod: "CD",
  mdg: "MG", mus: "MU", reu: "RE", glp: "GP", mtq: "MQ", guf: "GF", myt: "YT", ncl: "NC", pyf: "PF", mco: "MC", and: "AD", lbn: "LB",
  jor: "JO", irq: "IQ", kwt: "KW", bhr: "BH", omn: "OM", vnm: "VN", tha: "TH", idn: "ID", phl: "PH", mys: "MY", sgp: "SG", twn: "TW",
  hkg: "HK", zzz: "ZZ",
};

let names: Intl.DisplayNames | null = null;
try {
  names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
} catch {
  names = null;
}

export function countryName(alpha3: string): string {
  const a2 = ALPHA3_TO_ALPHA2[alpha3.toLowerCase()];
  if (!a2) return alpha3.toUpperCase();
  if (a2 === "ZZ") return "Unknown";
  try {
    return names?.of(a2) ?? a2;
  } catch {
    return a2;
  }
}

export function deviceName(device: string): string {
  const d = device.toUpperCase();
  return d === "DESKTOP" ? "Desktop" : d === "MOBILE" ? "Mobile" : d === "TABLET" ? "Tablet" : device;
}

/** GSC searchAppearance enum values → readable labels. */
export function appearanceName(value: string): string {
  const map: Record<string, string> = {
    AMP_BLUE_LINK: "AMP (blue link)",
    AMP_TOP_STORIES: "AMP top stories",
    AMP_IMAGE_RESULT: "AMP image",
    PRODUCT_SNIPPETS: "Product snippets",
    MERCHANT_LISTINGS: "Merchant listings",
    REVIEW_SNIPPET: "Review snippet",
    RICH_SNIPPET: "Rich snippet",
    VIDEO: "Video",
    WEBLITE: "Web light",
    PAGE_EXPERIENCE: "Page experience",
    ORGANIC_SHOPPING: "Organic shopping",
    TRANSLATED_RESULT: "Translated result",
    SEARCH_APPEARANCE_ANDROID_APP: "Android app",
    JOB_LISTING: "Job listing",
    JOB_DETAILS: "Job details",
    EVENTS_LISTING: "Events listing",
    EVENTS_DETAILS: "Events details",
    RECIPE_FEATURE: "Recipe feature",
    RECIPE_RICH_SNIPPET: "Recipe rich snippet",
    TPF_QA: "Q&A",
    TPF_FAQ: "FAQ",
    TPF_HOWTO: "How-to",
    SPECIAL_ANNOUNCEMENT: "Special announcement",
    PRACTICE_PROBLEMS: "Practice problems",
    MATH_SOLVERS: "Math solvers",
    SUBSCRIBED_CONTENT: "Subscribed content",
    LEARNING_VIDEOS: "Learning videos",
    DATASET: "Dataset",
    EDU_Q_AND_A: "Education Q&A",
  };
  return map[value] ?? value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
