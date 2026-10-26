import type { AuthenticityClass, HeuristicSignal, RiskBreakdown, Sentiment } from "./types";

export const WEIGHTS = {
  final: { heuristic: 0.5, gemini: 0.4, mismatch: 0.1 },
  signals: { generic: 0.15, specificity: 0.15, repetition: 0.1, promo: 0.15, nearDuplicate: 0.25, burst: 0.1 },
} as const;

export const THRESHOLDS = { moderate: 0.33, high: 0.66 } as const;

export interface ReviewLike {
  id: string;
  text: string;
  title?: string | null;
  rating: number;
  date?: string | null;
}

const GENERIC_PHRASES = [
  "good product", "nice product", "very good", "great product", "awesome product", "value for money",
  "worth it", "worth the money", "best product", "must buy", "love it", "excellent product", "good quality",
  "superb", "nice", "good", "ok ok", "super",
];
const PROMO_PHRASES = [
  "highly recommend", "must buy", "buy it", "don't miss", "dont miss", "best ever", "100% genuine",
  "go for it", "just buy", "life changing", "five stars", "5 stars", "trust me",
];
const UNIT_RE = /\b\d+(\.\d+)?\s?(mah|gb|tb|mp|hz|w|kg|g|ml|l|hrs?|hours?|days?|weeks?|months?|mins?|minutes?|inch|inches|cm|mm|fps|nits|rs|₹)\b/i;

export function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s'%-]/gu, " ").split(/\s+/).filter(Boolean);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function shingles(tokens: string[], k = 3): Set<string> {
  const out = new Set<string>();
  if (tokens.length < k) {
    if (tokens.length > 0) out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i <= tokens.length - k; i++) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function genericness(tokens: string[], lower: string): HeuristicSignal {
  const n = tokens.length;
  const hits = GENERIC_PHRASES.filter((p) => lower.includes(p)).length;
  let s = n <= 8 ? 0.7 : n <= 15 ? 0.45 : n <= 22 && hits > 0 ? 0.25 : 0;
  if (hits > 0 && n <= 26) s += Math.min(0.6, hits * 0.25);
  s = clamp01(s);
  return {
    name: "generic_language",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.generic,
    detail: s > 0 ? `Generic stock wording (${n} words, ${hits} stock phrase${hits === 1 ? "" : "s"}).` : "Not generic.",
  };
}

function specificity(tokens: string[], raw: string): HeuristicSignal {
  const n = tokens.length;
  // Ignore spam numerics like "100%" or "5 stars" when measuring technical/usage specificity
  const cleaned = raw.replace(/\b100%\b|\b[1-5]\s*stars?\b/gi, "");
  const unitHits = (cleaned.match(new RegExp(UNIT_RE.source, "gi")) ?? []).length;
  const concreteNumbers = tokens.filter((t) => /\d/.test(t) && t !== "100%" && !/^[1-5]$/.test(t)).length;
  const specScore = Math.min(1, unitHits * 0.45 + concreteNumbers * 0.25 + (Math.min(n, 55) / 55) * 0.55);
  const s = clamp01(1 - specScore);
  return {
    name: "lacks_specific_details",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.specificity,
    detail: s >= 0.5 ? `Few concrete product details (${unitHits} specs/units, ${n} words).` : "Contains concrete usage details.",
  };
}

function repetition(tokens: string[]): HeuristicSignal {
  const content = tokens.filter((t) => t.length >= 4);
  const freq = new Map<string, number>();
  for (const t of content) freq.set(t, (freq.get(t) ?? 0) + 1);
  const maxShare = content.length >= 8 ? Math.max(0, ...freq.values()) / content.length : 0;
  const tri = new Map<string, number>();
  for (let i = 0; i + 3 <= tokens.length; i++) {
    const k = tokens.slice(i, i + 3).join(" ");
    tri.set(k, (tri.get(k) ?? 0) + 1);
  }
  const repeatedTrigrams = [...tri.values()].filter((c) => c >= 2).length;
  const s = clamp01(repeatedTrigrams / 3 + (maxShare > 0.25 ? 0.5 : 0));
  return {
    name: "repetition",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.repetition,
    detail: s > 0 ? `Repeated phrases (${repeatedTrigrams} repeated 3-word groups).` : "No notable repetition.",
  };
}

function promo(raw: string, lower: string): HeuristicSignal {
  const hits = PROMO_PHRASES.filter((p) => lower.includes(p)).length;
  const contact = /(https?:\/\/|www\.|whatsapp|telegram|\b\d{10}\b|@[a-z0-9_]{3,})/i.test(raw);
  const excl = (raw.match(/!/g) ?? []).length;
  const letters = raw.replace(/[^A-Za-z]/g, "");
  const caps = letters.length >= 10 ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const s = clamp01(0.35 * hits + (contact ? 0.65 : 0) + (excl >= 3 ? 0.35 : 0) + (caps > 0.4 ? 0.35 : 0));
  return {
    name: "promotional_language",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.promo,
    detail:
      s > 0
        ? `Promotional hype (${hits} promo phrase${hits === 1 ? "" : "s"}${contact ? ", external contact/link" : ""}${excl >= 3 ? ", excessive '!'" : ""}${caps > 0.4 ? ", ALL-CAPS shouting" : ""}).`
        : "No promotional pattern.",
  };
}

function nearDuplicate(me: ReviewLike, siblings: ReviewLike[]): HeuristicSignal {
  const mine = shingles(words(`${me.title ?? ""} ${me.text}`));
  let best = 0;
  let cluster = 0;
  for (const o of siblings) {
    if (o.id === me.id) continue;
    const sim = jaccard(mine, shingles(words(`${o.title ?? ""} ${o.text}`)));
    best = Math.max(best, sim);
    if (sim >= 0.6) cluster += 1;
  }
  let s = clamp01((best - 0.3) / 0.5);
  if (cluster >= 2) s = clamp01(s + 0.2);
  return {
    name: "near_duplicate_reviews",
    applicable: siblings.some((o) => o.id !== me.id),
    strength: s,
    weight: WEIGHTS.signals.nearDuplicate,
    detail: s > 0 ? `Very similar to ${Math.max(cluster, 1)} other review(s) of this product (similarity ${best.toFixed(2)}).` : "Not similar to other reviews.",
  };
}

function burst(me: ReviewLike, siblings: ReviewLike[]): HeuristicSignal {
  const dated = siblings.filter((r) => r.date);
  const base = { name: "review_burst", weight: WEIGHTS.signals.burst };
  if (!me.date || dated.length < 8) return { ...base, applicable: false, strength: 0, detail: "Not enough dated reviews to judge timing." };
  const sameDay = dated.filter((r) => r.date === me.date).length;
  const share = sameDay / dated.length;
  const s = sameDay >= 4 ? clamp01((share - 0.2) / 0.4) : 0;
  return { ...base, applicable: true, strength: s, detail: s > 0 ? `${sameDay} of ${dated.length} dated reviews were posted on the same day.` : "No unusual timing cluster." };
}

export function heuristicSignals(review: ReviewLike, siblings: ReviewLike[]): { risk: number; signals: HeuristicSignal[] } {
  const raw = `${review.title ?? ""}. ${review.text}`;
  const lower = raw.toLowerCase();
  const tokens = words(raw);
  const sigGeneric = genericness(tokens, lower);
  const sigSpec = specificity(tokens, raw);
  const sigRep = repetition(tokens);
  const sigPromo = promo(raw, lower);
  const sigDup = nearDuplicate(review, siblings);
  const sigBurst = burst(review, siblings);
  const signals = [sigGeneric, sigSpec, sigRep, sigPromo, sigDup, sigBurst];

  // Core linguistic risk so standalone spam isn't diluted when nearDuplicate=0
  const coreRisk = clamp01(
    sigGeneric.strength * 0.28 +
      sigSpec.strength * 0.27 +
      sigPromo.strength * 0.35 +
      sigRep.strength * 0.1,
  );
  // Amplify when sibling copy-paste or date burst is present
  const clusterBoost = (sigDup.applicable ? sigDup.strength * 0.45 : 0) + (sigBurst.applicable ? sigBurst.strength * 0.25 : 0);
  const risk = clamp01(coreRisk + clusterBoost);
  return { risk, signals };
}

export function ratingMismatch(rating: number, sentiment: Sentiment, sentimentConfidence: number): number {
  const expected: Sentiment = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";
  if (expected === sentiment) return 0;
  const opposite = (expected === "positive" && sentiment === "negative") || (expected === "negative" && sentiment === "positive");
  return clamp01((opposite ? 1 : 0.4) * sentimentConfidence);
}

export function classifyRisk(risk: number): AuthenticityClass {
  if (risk >= THRESHOLDS.high) return "highly_suspicious";
  if (risk >= THRESHOLDS.moderate) return "moderate_suspicion";
  return "low_suspicion";
}

export function combineRisk(input: {
  heuristicRisk: number;
  geminiRisk: number;
  ratingMismatch: number;
  signals: HeuristicSignal[];
}): { risk: number; classification: AuthenticityClass; breakdown: RiskBreakdown } {
  const w = WEIGHTS.final;
  const risk = clamp01(w.heuristic * input.heuristicRisk + w.gemini * input.geminiRisk + w.mismatch * input.ratingMismatch);
  const rounded = Math.round(risk * 1000) / 1000;
  return {
    risk: rounded,
    classification: classifyRisk(rounded),
    breakdown: {
      heuristicRisk: Math.round(input.heuristicRisk * 1000) / 1000,
      geminiRisk: Math.round(input.geminiRisk * 1000) / 1000,
      ratingMismatch: Math.round(input.ratingMismatch * 1000) / 1000,
      weights: { ...w },
      signals: input.signals,
    },
  };
}

const NEG_TERMS = [
  "accidentally", "by mistake", "meant to leave", "meant 1", "meant 2", "heats up", "overheats",
  "warms up", "drains", "broken", "defective", "torn", "choppy", "laggy", "muddy", "sweaty", "disappointed",
  "waste", "poor", "worst", "terrible", "returned", "refund", "stops working", "unusable", "dated", "fills up fast",
];
const POS_TERMS = [
  "excellent", "amazing", "fantastic", "crystal clear", "silences", "worth every", "worth it", "rock solid",
  "stellar", "superb", "best travel", "love", "impressed", "flawless", "smooth", "sharp", "class-leading",
];

/** Lexical fallback sentiment used only when Gemini API is offline/unavailable. */
export function inferLexicalSentiment(title: string | null | undefined, text: string, rating: number): Sentiment {
  const combined = `${title ?? ""} ${text}`.toLowerCase();
  if (/clicked [12] stars? by mistake|meant 5 stars?/i.test(combined)) return "positive";
  if (/(tapped|clicked|gave) 5 stars? (accidentally|by mistake)|meant [12] stars?/i.test(combined)) return "negative";
  let neg = 0;
  let pos = 0;
  for (const w of NEG_TERMS) if (combined.includes(w)) neg += 1;
  for (const w of POS_TERMS) if (combined.includes(w)) pos += 1;
  if (neg >= 2 && neg > pos) return "negative";
  if (pos >= 2 && pos > neg) return "positive";
  if (neg >= 1 && pos >= 1 && rating === 3) return "neutral";
  return rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";
}

const ASPECT_KEYWORDS: { name: string; re: RegExp }[] = [
  { name: "camera", re: /\b(camera|48mp|photo|video|portrait|lens)\b/i },
  { name: "battery life", re: /\b(battery|mah|overnight|backup|endurance|runtime)\b/i },
  { name: "display", re: /\b(screen|display|60hz|120hz|amoled|oled|brightness)\b/i },
  { name: "charging & thermals", re: /\b(charg|warm|heat|20w|usb-c|thermal)\b/i },
  { name: "noise cancellation", re: /\b(anc|noise cancel|cabin|chatter)\b/i },
  { name: "sound quality", re: /\b(sound|bass|audio|vocal|eq|tuning)\b/i },
  { name: "comfort & fit", re: /\b(earcup|pad|comfort|fit|sweat|clamp|weight)\b/i },
  { name: "portability & case", re: /\b(case|fold|backpack|portable|hinge)\b/i },
  { name: "build quality", re: /\b(build|metal|bezel|chassis|hinge|seal|durable)\b/i },
  { name: "value for price", re: /\b(price|₹|worth|value|expensive|cost)\b/i },
];

/** Extracts fallback aspects when Gemini API is unreachable in local preview. */
export function inferFallbackAspects(
  title: string | null | undefined,
  text: string,
  overallSentiment: Sentiment,
): { name: string; sentiment: Sentiment; confidence: number }[] {
  const combined = `${title ?? ""}. ${text}`;
  const clauses = combined.split(/[.,;—–]+|\bbut\b|\bhowever\b/i);
  const found: { name: string; sentiment: Sentiment; confidence: number }[] = [];

  for (const item of ASPECT_KEYWORDS) {
    if (!item.re.test(combined)) continue;
    const matchingClause = clauses.find((c) => item.re.test(c)) ?? combined;
    const cLow = matchingClause.toLowerCase();
    let sent: Sentiment = overallSentiment;
    const hasNeg = NEG_TERMS.some((w) => cLow.includes(w)) || /\b(no |not |without |lacks |slow|heavy|bulky|short)\b/i.test(cLow);
    const hasPos = POS_TERMS.some((w) => cLow.includes(w)) || /\b(great|good|fast|clean|quiet|accurate)\b/i.test(cLow);
    if (hasNeg && !hasPos) sent = "negative";
    else if (hasPos && !hasNeg) sent = "positive";
    found.push({ name: item.name, sentiment: sent, confidence: 0.82 });
    if (found.length >= 4) break;
  }
  return found;
}
