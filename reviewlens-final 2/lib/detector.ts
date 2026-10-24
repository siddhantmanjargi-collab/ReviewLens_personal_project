import type { AuthenticityClass, HeuristicSignal, RiskBreakdown, Sentiment } from "./types";

/**
 * Review authenticity SIGNALS. This produces a risk score, not a verdict: a high score means
 * "this review shows patterns often seen in unreliable reviews", never "this person lied".
 *
 * The weights and thresholds below are reasoned starting points. They have NOT been calibrated
 * against labelled real/fake reviews, so treat the numbers as relative, not as probabilities.
 */

export const WEIGHTS = {
  /** share of the final score coming from each part */
  final: { heuristic: 0.5, gemini: 0.4, mismatch: 0.1 },
  signals: { generic: 0.15, specificity: 0.15, repetition: 0.1, promo: 0.15, nearDuplicate: 0.25, burst: 0.1 },
} as const;

export const THRESHOLDS = { moderate: 0.33, high: 0.66 } as const;

export interface ReviewLike {
  id: string;
  text: string;
  title?: string | null;
  rating: number;
  date?: string | null; // YYYY-MM-DD
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
  let s = n <= 6 ? 0.7 : n <= 12 ? 0.4 : 0;
  if (hits > 0 && n <= 20) s += 0.3;
  s = clamp01(s);
  return {
    name: "generic_language",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.generic,
    detail: s > 0 ? `Very short / generic wording (${n} words, ${hits} stock phrases).` : "Not generic.",
  };
}

function specificity(tokens: string[], raw: string): HeuristicSignal {
  const n = tokens.length;
  const numeric = tokens.filter((t) => /\d/.test(t)).length + (UNIT_RE.test(raw) ? 1 : 0);
  const s = clamp01(1 - Math.min(1, numeric * 0.4 + (Math.min(n, 60) / 60) * 0.6));
  return {
    name: "lacks_specific_details",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.specificity,
    detail: s >= 0.5 ? `Few concrete details (${numeric} numbers/units, ${n} words).` : "Contains concrete details.",
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
  const s = clamp01(0.35 * hits + (contact ? 0.6 : 0) + (excl >= 3 ? 0.3 : 0) + (caps > 0.4 ? 0.3 : 0));
  return {
    name: "promotional_language",
    applicable: true,
    strength: s,
    weight: WEIGHTS.signals.promo,
    detail: s > 0 ? `Promotional pattern (${hits} phrases${contact ? ", link/contact details" : ""}${excl >= 3 ? ", heavy exclamation" : ""}).` : "No promotional pattern.",
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

/** Text + cross-review signals that do not need Gemini. `siblings` = the product's other reviews. */
export function heuristicSignals(review: ReviewLike, siblings: ReviewLike[]): { risk: number; signals: HeuristicSignal[] } {
  const raw = `${review.title ?? ""}. ${review.text}`;
  const lower = raw.toLowerCase();
  const tokens = words(raw);
  const signals = [
    genericness(tokens, lower),
    specificity(tokens, raw),
    repetition(tokens),
    promo(raw, lower),
    nearDuplicate(review, siblings),
    burst(review, siblings),
  ];
  // Only signals that could actually be judged count. A review with no other reviews to compare
  // against is not "less suspicious" because the duplicate check had nothing to look at.
  const judged = signals.filter((s) => s.applicable);
  const totalWeight = judged.reduce((a, s) => a + s.weight, 0);
  const risk = clamp01(judged.reduce((a, s) => a + s.strength * s.weight, 0) / totalWeight);
  return { risk, signals };
}

/** 0 = the star rating and the text agree, 1 = they clearly disagree. Needs Gemini's sentiment. */
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
      geminiRisk: input.geminiRisk,
      ratingMismatch: Math.round(input.ratingMismatch * 1000) / 1000,
      weights: { ...w },
      signals: input.signals,
    },
  };
}
