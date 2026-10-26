import type {
  NewProductAnalysis,
  ProductAnalysisRecord,
  ProductAspectRecord,
  ReviewAnalysisRecord,
  ReviewRecord,
} from "./types";

export interface StarSegregationBucket {
  star: number;
  total: number;
  genuine: number;
  suspicious: number;
  mismatched: number;
}

export function computeProductAggregates(
  productId: string,
  reviewsTotal: number,
  analyses: ReviewAnalysisRecord[],
  model: string,
  reviews?: ReviewRecord[],
): {
  analysis: NewProductAnalysis;
  aspects: Omit<ProductAspectRecord, "productId">[];
} {
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;
  let confSum = 0;
  let riskSum = 0;
  let mismatchCount = 0;

  const dist: Record<string, number> = {
    low_suspicion: 0,
    moderate_suspicion: 0,
    highly_suspicious: 0,
  };

  // Track both all-review aspects AND genuine-only (low_suspicion) aspects
  const aspectMap = new Map<
    string,
    { mentionCount: number; positiveCount: number; neutralCount: number; negativeCount: number }
  >();
  const trustedAspectMap = new Map<
    string,
    { mentionCount: number; positiveCount: number; neutralCount: number; negativeCount: number }
  >();

  for (const a of analyses) {
    if (a.sentiment === "positive") positiveCount += 1;
    else if (a.sentiment === "neutral") neutralCount += 1;
    else negativeCount += 1;

    confSum += a.sentimentConfidence;
    riskSum += a.authenticityRisk;
    dist[a.authenticityClassification] = (dist[a.authenticityClassification] ?? 0) + 1;

    if ((a.riskBreakdown?.ratingMismatch ?? 0) >= 0.3) {
      mismatchCount += 1;
    }

    const isTrusted = a.authenticityClassification === "low_suspicion";

    for (const asp of a.aspects) {
      const prev = aspectMap.get(asp.name) ?? {
        mentionCount: 0,
        positiveCount: 0,
        neutralCount: 0,
        negativeCount: 0,
      };
      prev.mentionCount += 1;
      if (asp.sentiment === "positive") prev.positiveCount += 1;
      else if (asp.sentiment === "neutral") prev.neutralCount += 1;
      else prev.negativeCount += 1;
      aspectMap.set(asp.name, prev);

      if (isTrusted) {
        const tPrev = trustedAspectMap.get(asp.name) ?? {
          mentionCount: 0,
          positiveCount: 0,
          neutralCount: 0,
          negativeCount: 0,
        };
        tPrev.mentionCount += 1;
        if (asp.sentiment === "positive") tPrev.positiveCount += 1;
        else if (asp.sentiment === "neutral") tPrev.neutralCount += 1;
        else tPrev.negativeCount += 1;
        trustedAspectMap.set(asp.name, tPrev);
      }
    }
  }

  const n = analyses.length;
  const avgConfidence = n > 0 ? Math.round((confSum / n) * 1000) / 1000 : null;
  const averageRisk = n > 0 ? Math.round((riskSum / n) * 1000) / 1000 : 0;

  // Prefer trusted-only aspect consensus if available, falling back to full aspect map
  const sourceMap = trustedAspectMap.size > 0 ? trustedAspectMap : aspectMap;
  const aspects = [...sourceMap.entries()]
    .map(([aspectName, c]) => ({ aspectName, ...c }))
    .sort((a, b) => b.mentionCount - a.mentionCount);

  // Compute star-rating & verified-purchase segregation stats when reviews are provided
  const details: Record<string, unknown> = {
    averageRisk,
    mismatchCount,
  };

  if (reviews && reviews.length > 0) {
    const analysisByReviewId = new Map(analyses.map((a) => [a.reviewId, a]));
    let rawStarSum = 0;
    let genuineStarSum = 0;
    let genuineStarCount = 0;
    let verifiedPurchaseCount = 0;
    let unverifiedPurchaseCount = 0;

    const starBuckets = new Map<number, StarSegregationBucket>();
    for (const s of [5, 4, 3, 2, 1]) {
      starBuckets.set(s, { star: s, total: 0, genuine: 0, suspicious: 0, mismatched: 0 });
    }

    for (const rev of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(rev.rating)));
      rawStarSum += rev.rating;
      if (rev.verifiedPurchase) verifiedPurchaseCount += 1;
      else unverifiedPurchaseCount += 1;

      const ana = analysisByReviewId.get(rev.id);
      const risk = ana?.authenticityRisk ?? 0.1;
      const mismatch = ana?.riskBreakdown?.ratingMismatch ?? 0;
      const isSuspicious = risk >= 0.33;
      const isMismatched = mismatch >= 0.3;

      const bucket = starBuckets.get(star)!;
      bucket.total += 1;
      if (isSuspicious) bucket.suspicious += 1;
      else bucket.genuine += 1;
      if (isMismatched) bucket.mismatched += 1;

      if (!isSuspicious && !isMismatched) {
        genuineStarSum += rev.rating;
        genuineStarCount += 1;
      }
    }

    details.rawAverageRating = Math.round((rawStarSum / reviews.length) * 100) / 100;
    details.genuineAverageRating =
      genuineStarCount > 0 ? Math.round((genuineStarSum / genuineStarCount) * 100) / 100 : null;
    details.genuineCount = genuineStarCount;
    details.verifiedPurchaseCount = verifiedPurchaseCount;
    details.unverifiedPurchaseCount = unverifiedPurchaseCount;
    details.starBreakdown = [5, 4, 3, 2, 1].map((s) => starBuckets.get(s)!);
  }

  return {
    analysis: {
      productId,
      reviewsTotal: Math.max(reviewsTotal, n),
      reviewsAnalyzed: n,
      positiveCount,
      neutralCount,
      negativeCount,
      avgSentimentConfidence: avgConfidence,
      authenticityDistribution: dist,
      details,
      model,
    },
    aspects,
  };
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

export function presentAspects(aspects: ProductAspectRecord[]) {
  return aspects.map((a) => ({
    aspectName: a.aspectName,
    mentionCount: a.mentionCount,
    positiveCount: a.positiveCount,
    neutralCount: a.neutralCount,
    negativeCount: a.negativeCount,
    positivePercent: pct(a.positiveCount, a.mentionCount),
    neutralPercent: pct(a.neutralCount, a.mentionCount),
    negativePercent: pct(a.negativeCount, a.mentionCount),
  }));
}

export function presentAnalysis(a: ProductAnalysisRecord, aspects: ProductAspectRecord[]) {
  const n = a.reviewsAnalyzed;
  return {
    asOf: a.computedAt,
    dataFreshness: "daily_snapshot",
    model: a.model,
    reviewsTotal: a.reviewsTotal,
    reviewsAnalyzed: n,
    positiveCount: a.positiveCount,
    neutralCount: a.neutralCount,
    negativeCount: a.negativeCount,
    sentimentPercentages: {
      positive: pct(a.positiveCount, n),
      neutral: pct(a.neutralCount, n),
      negative: pct(a.negativeCount, n),
    },
    avgSentimentConfidence: a.avgSentimentConfidence,
    authenticityDistribution: a.authenticityDistribution,
    details: a.details,
    aspects: presentAspects(aspects),
  };
}
