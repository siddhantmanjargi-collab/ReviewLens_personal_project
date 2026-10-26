import { NextResponse } from "next/server";
import { presentAnalysis } from "@/lib/aggregate";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { buildContext } from "@/lib/context";
import { PROMPT_VERSION } from "@/lib/gemini";
import type { ReviewAnalysisRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = buildContext();
  const model = ctx.analysis?.model ?? DEFAULT_GEMINI_MODEL;
  const products = await ctx.repo.listProducts(200, 0);

  const items = await Promise.all(
    products.map(async (product) => {
      const [analysisRecord, reviews, analysesList] = await Promise.all([
        ctx.repo.getProductAnalysis(product.id),
        ctx.repo.listReviews(product.id, { limit: 50, offset: 0, publicOnly: true }),
        ctx.repo.analysesForProduct(product.id, model, PROMPT_VERSION),
      ]);
      const aspects = analysisRecord ? await ctx.repo.listProductAspects(product.id) : [];

      const reviewAnalyses: Record<string, ReviewAnalysisRecord> = {};
      for (const a of analysesList) {
        reviewAnalyses[a.reviewId] = a;
      }

      // Compute genuine-adjusted star score for immediate comparison & card display
      let rawSum = 0;
      let cleanSum = 0;
      let cleanCount = 0;
      for (const r of reviews) {
        rawSum += r.rating;
        const ana = reviewAnalyses[r.id];
        const risk = ana?.authenticityRisk ?? 0.1;
        const mis = ana?.riskBreakdown?.ratingMismatch ?? 0;
        if (risk < 0.33 && mis < 0.3) {
          cleanSum += r.rating;
          cleanCount += 1;
        }
      }
      const rawAvg = reviews.length > 0 ? rawSum / reviews.length : product.rating ?? 0;
      const genuineAvg = cleanCount > 0 ? cleanSum / cleanCount : rawAvg;

      const baseSnapshot = analysisRecord ? presentAnalysis(analysisRecord, aspects) : null;
      const snapshot = baseSnapshot
        ? {
            ...baseSnapshot,
            details: {
              ...(baseSnapshot.details ?? {}),
              rawAverageRating: Math.round(rawAvg * 100) / 100,
              genuineAverageRating: Math.round(genuineAvg * 100) / 100,
              ratingDelta: Math.round((genuineAvg - rawAvg) * 100) / 100,
            },
          }
        : null;

      return {
        product,
        snapshot,
        reviews,
        reviewAnalyses,
      };
    }),
  );

  return NextResponse.json({
    total: items.length,
    asOf: items[0]?.snapshot?.asOf ?? new Date().toISOString(),
    items,
  });
}
