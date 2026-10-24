import type {
  AuthenticityClass,
  NewProductAnalysis,
  ProductAspectRecord,
  ReviewAnalysisRecord,
  Sentiment,
} from "./types";

export const ASPECT_MIN_CONFIDENCE = 0.5;
export const LOW_SAMPLE_BELOW = 10;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function countSentiments(rows: ReviewAnalysisRecord[]): Record<Sentiment, number> {
  const c: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) c[r.sentiment] += 1;
  return c;
}

/**
 * Product-level numbers computed from the stored review-level analyses. Gemini never supplies a
 * percentage or a total: every figure here is a count over real rows.
 */
export function aggregateProduct(
  productId: string,
  reviewsTotal: number,
  analyses: ReviewAnalysisRecord[],
  model: string,
): { analysis: NewProductAnalysis; aspects: Omit<ProductAspectRecord, "productId">[] } {
  const sentiments = countSentiments(analyses);
  const dist: Record<AuthenticityClass, number> = { low_suspicion: 0, moderate_suspicion: 0, highly_suspicious: 0 };
  for (const a of analyses) dist[a.authenticityClassification] += 1;

  const trusted = analyses.filter((a) => a.authenticityClassification !== "highly_suspicious");
  const trustedSent = countSentiments(trusted);

  const avgConf = analyses.length ? round3(analyses.reduce((s, a) => s + a.sentimentConfidence, 0) / analyses.length) : null;
  const avgRisk = analyses.length ? round3(analyses.reduce((s, a) => s + a.authenticityRisk, 0) / analyses.length) : null;

  // Each review counts at most once per aspect (its most confident mention).
  const byAspect = new Map<string, { positive: number; neutral: number; negative: number }>();
  for (const a of analyses) {
    const seen = new Map<string, { sentiment: Sentiment; confidence: number }>();
    for (const asp of a.aspects) {
      if (asp.confidence < ASPECT_MIN_CONFIDENCE) continue;
      const prev = seen.get(asp.name);
      if (!prev || asp.confidence > prev.confidence) seen.set(asp.name, { sentiment: asp.sentiment, confidence: asp.confidence });
    }
    for (const [name, v] of seen) {
      const e = byAspect.get(name) ?? { positive: 0, neutral: 0, negative: 0 };
      e[v.sentiment] += 1;
      byAspect.set(name, e);
    }
  }
  const aspects = [...byAspect.entries()]
    .map(([aspectName, c]) => ({
      aspectName,
      mentionCount: c.positive + c.neutral + c.negative,
      positiveCount: c.positive,
      neutralCount: c.neutral,
      negativeCount: c.negative,
    }))
    .sort((x, y) => y.mentionCount - x.mentionCount || x.aspectName.localeCompare(y.aspectName));

  const complaints = aspects.filter((a) => a.negativeCount >= 2).sort((x, y) => y.negativeCount - x.negativeCount).slice(0, 5).map((a) => a.aspectName);
  const praise = aspects.filter((a) => a.positiveCount >= 2).sort((x, y) => y.positiveCount - x.positiveCount).slice(0, 5).map((a) => a.aspectName);

  return {
    analysis: {
      productId,
      reviewsTotal,
      reviewsAnalyzed: analyses.length,
      positiveCount: sentiments.positive,
      neutralCount: sentiments.neutral,
      negativeCount: sentiments.negative,
      avgSentimentConfidence: avgConf,
      authenticityDistribution: { ...dist },
      details: {
        avgAuthenticityRisk: avgRisk,
        lowSample: analyses.length < LOW_SAMPLE_BELOW,
        sentimentExcludingHighlySuspicious: { ...trustedSent, total: trusted.length },
        commonComplaints: complaints,
        commonPositiveThemes: praise,
      },
      model,
    },
    aspects,
  };
}

const pct = (n: number, total: number) => (total === 0 ? null : Math.round((n / total) * 1000) / 10);

/** Shapes stored counts into the public response (percentages are derived here from counts). */
export function presentAnalysis(
  a: {
    productId: string;
    reviewsTotal: number;
    reviewsAnalyzed: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    avgSentimentConfidence: number | null;
    authenticityDistribution: Record<string, number>;
    details: Record<string, unknown>;
    model: string | null;
    computedAt: string;
  },
  aspects: ProductAspectRecord[],
) {
  const n = a.reviewsAnalyzed;
  const d = a.authenticityDistribution;
  const ex = (a.details.sentimentExcludingHighlySuspicious ?? {}) as Record<string, number>;
  const exTotal = ex.total ?? 0;
  return {
    productId: a.productId,
    asOf: a.computedAt,
    dataFreshness: "daily_snapshot",
    model: a.model,
    reviewsTotal: a.reviewsTotal,
    reviewsAnalyzed: n,
    coveragePercent: pct(n, a.reviewsTotal),
    lowSample: n < LOW_SAMPLE_BELOW,
    sentiment: {
      positive: { count: a.positiveCount, percent: pct(a.positiveCount, n) },
      neutral: { count: a.neutralCount, percent: pct(a.neutralCount, n) },
      negative: { count: a.negativeCount, percent: pct(a.negativeCount, n) },
      avgConfidence: a.avgSentimentConfidence,
    },
    sentimentExcludingHighlySuspicious: {
      total: exTotal,
      positive: { count: ex.positive ?? 0, percent: pct(ex.positive ?? 0, exTotal) },
      neutral: { count: ex.neutral ?? 0, percent: pct(ex.neutral ?? 0, exTotal) },
      negative: { count: ex.negative ?? 0, percent: pct(ex.negative ?? 0, exTotal) },
    },
    authenticity: {
      lowSuspicion: { count: d.low_suspicion ?? 0, percent: pct(d.low_suspicion ?? 0, n) },
      moderateSuspicion: { count: d.moderate_suspicion ?? 0, percent: pct(d.moderate_suspicion ?? 0, n) },
      highlySuspicious: { count: d.highly_suspicious ?? 0, percent: pct(d.highly_suspicious ?? 0, n) },
      avgRisk: a.details.avgAuthenticityRisk ?? null,
      note: "Risk scores are estimates based on language and pattern signals. They are not proof that any review is fake.",
    },
    aspects: presentAspects(aspects),
    commonComplaints: a.details.commonComplaints ?? [],
    commonPositiveThemes: a.details.commonPositiveThemes ?? [],
  };
}

export function presentAspects(aspects: ProductAspectRecord[]) {
  return aspects.map((x) => ({
    name: x.aspectName,
    mentions: x.mentionCount,
    positive: { count: x.positiveCount, percent: pct(x.positiveCount, x.mentionCount) },
    neutral: { count: x.neutralCount, percent: pct(x.neutralCount, x.mentionCount) },
    negative: { count: x.negativeCount, percent: pct(x.negativeCount, x.mentionCount) },
  }));
}
