import { describe, expect, it } from "vitest";
import { aggregateProduct, presentAnalysis } from "@/lib/aggregate";
import type { AuthenticityClass, ReviewAnalysisRecord, Sentiment } from "@/lib/types";

let n = 0;
function a(sentiment: Sentiment, cls: AuthenticityClass, aspects: { name: string; sentiment: Sentiment; confidence: number }[] = [], risk = 0.1): ReviewAnalysisRecord {
  n += 1;
  return {
    id: `a${n}`, reviewId: `r${n}`, model: "m", promptVersion: "v1", sentiment, sentimentConfidence: 0.8,
    authenticityRisk: risk, authenticityClassification: cls, aspects, reasoningSignals: [],
    riskBreakdown: { heuristicRisk: 0, geminiRisk: 0, ratingMismatch: 0, weights: { heuristic: 0.5, gemini: 0.4, mismatch: 0.1 }, signals: [] },
    analyzedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("aggregateProduct", () => {
  const rows = [
    a("positive", "low_suspicion", [{ name: "battery", sentiment: "positive", confidence: 0.9 }]),
    a("positive", "low_suspicion", [{ name: "battery", sentiment: "positive", confidence: 0.8 }, { name: "camera", sentiment: "negative", confidence: 0.9 }]),
    a("negative", "moderate_suspicion", [{ name: "battery", sentiment: "negative", confidence: 0.7 }, { name: "camera", sentiment: "negative", confidence: 0.8 }]),
    a("positive", "highly_suspicious", [{ name: "battery", sentiment: "positive", confidence: 0.95 }], 0.9),
  ];
  const { analysis, aspects } = aggregateProduct("p1", 6, rows, "m");

  it("counts sentiments from the stored rows", () => {
    expect([analysis.positiveCount, analysis.neutralCount, analysis.negativeCount]).toEqual([3, 0, 1]);
    expect(analysis.reviewsAnalyzed).toBe(4);
    expect(analysis.reviewsTotal).toBe(6);
    expect(analysis.positiveCount + analysis.neutralCount + analysis.negativeCount).toBe(analysis.reviewsAnalyzed);
  });
  it("counts the authenticity distribution", () => {
    expect(analysis.authenticityDistribution).toEqual({ low_suspicion: 2, moderate_suspicion: 1, highly_suspicious: 1 });
  });
  it("also reports sentiment without the highly suspicious reviews", () => {
    expect(analysis.details.sentimentExcludingHighlySuspicious).toEqual({ positive: 2, neutral: 0, negative: 1, total: 3 });
  });
  it("aggregates aspects with consistent counts", () => {
    const battery = aspects.find((x) => x.aspectName === "battery")!;
    expect(battery).toMatchObject({ mentionCount: 4, positiveCount: 3, negativeCount: 1, neutralCount: 0 });
    for (const x of aspects) expect(x.positiveCount + x.neutralCount + x.negativeCount).toBe(x.mentionCount);
    expect(analysis.details.commonComplaints).toContain("camera");
    expect(analysis.details.commonPositiveThemes).toContain("battery");
  });
  it("counts a review once per aspect and ignores low-confidence aspects", () => {
    const r = a("positive", "low_suspicion", [
      { name: "display", sentiment: "positive", confidence: 0.9 },
      { name: "display", sentiment: "negative", confidence: 0.6 },
      { name: "speaker", sentiment: "positive", confidence: 0.3 },
    ]);
    const out = aggregateProduct("p", 1, [r], "m");
    expect(out.aspects).toEqual([{ aspectName: "display", mentionCount: 1, positiveCount: 1, neutralCount: 0, negativeCount: 0 }]);
  });
  it("flags a small sample and handles zero analyses without dividing by zero", () => {
    expect(analysis.details.lowSample).toBe(true);
    const empty = aggregateProduct("p", 3, [], "m");
    expect(empty.analysis.avgSentimentConfidence).toBeNull();
    const shown = presentAnalysis({ ...empty.analysis, computedAt: "t" }, []);
    expect(shown.sentiment.positive.percent).toBeNull();
    expect(shown.coveragePercent).toBe(0);
  });
});

describe("presentAnalysis", () => {
  it("derives percentages from counts and labels the data as a daily snapshot", () => {
    const { analysis, aspects } = aggregateProduct("p1", 4, [a("positive", "low_suspicion"), a("positive", "low_suspicion"), a("positive", "low_suspicion"), a("negative", "low_suspicion")], "m");
    const shown = presentAnalysis({ ...analysis, computedAt: "2026-01-02T00:00:00.000Z" }, aspects.map((x) => ({ ...x, productId: "p1" })));
    expect(shown.sentiment.positive).toEqual({ count: 3, percent: 75 });
    expect(shown.sentiment.negative).toEqual({ count: 1, percent: 25 });
    expect(shown.dataFreshness).toBe("daily_snapshot");
    expect(shown.asOf).toBe("2026-01-02T00:00:00.000Z");
    expect(shown.authenticity.note).toMatch(/not proof/);
  });
});
