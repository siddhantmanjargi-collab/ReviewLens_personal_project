import { NextRequest, NextResponse } from "next/server";
import { getAnalysisCacheSummary } from "@/lib/analysisCache";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { buildContext } from "@/lib/context";
import { GROUND_TRUTH_DATASET, runAblationEvaluation } from "@/lib/evaluation";
import { computeCatalogShillForensics } from "@/lib/forensics";
import { classifyGeminiError, isGeminiKeyUsable, type GeminiFallbackReason } from "@/lib/gemini";
import type { Sentiment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const rawThreshold = Number(req.nextUrl.searchParams.get("threshold") ?? "0.33");
  const threshold = Number.isFinite(rawThreshold) ? rawThreshold : 0.33;

  const benchmark = runAblationEvaluation(threshold);

  const products = await ctx.repo.listProducts(200, 0);
  const reviews = [...ctx.catalogMemoryRepo.reviews.values()];
  const analyses = ctx.catalogMemoryRepo.analyses;

  const catalogForensics = computeCatalogShillForensics({
    products,
    reviews,
    analyses,
  });

  return NextResponse.json({
    mode: "reference",
    geminiConfigured: Boolean(ctx.analysis),
    fallbackReason: ctx.analysis ? undefined : ctx.analysisFallbackReason,
    model: ctx.analysis?.model ?? DEFAULT_GEMINI_MODEL,
    benchmark,
    catalogForensics,
    cacheStats: getAnalysisCacheSummary(),
  });
}

export async function POST(req: NextRequest) {
  const ctx = buildContext();
  let threshold = 0.33;
  try {
    const body = await req.json();
    if (typeof body?.threshold === "number" && Number.isFinite(body.threshold)) {
      threshold = body.threshold;
    }
  } catch {
    // Default threshold
  }

  const overrides = new Map<string, { risk: number; sentiment: Sentiment; confidence: number }>();
  let liveExecuted = false;
  let fallbackReason: GeminiFallbackReason | undefined = ctx.analysisFallbackReason;
  let totalCacheHits = 0;
  let totalCacheMisses = 0;

  if (ctx.analysis) {
    try {
      const chunkSize = 14;
      for (let i = 0; i < GROUND_TRUTH_DATASET.length; i += chunkSize) {
        const slice = GROUND_TRUTH_DATASET.slice(i, i + chunkSize);
        const outcome = await ctx.analysis.analyze({
          product: { name: "Multi-Product Electronics Benchmark", category: "Electronics" },
          reviews: slice.map((s) => ({
            id: s.id,
            rating: s.rating,
            title: s.title,
            text: s.text,
          })),
        });
        totalCacheHits += outcome.cacheHits ?? 0;
        totalCacheMisses += outcome.cacheMisses ?? 0;
        for (const r of outcome.results) {
          overrides.set(r.reviewId, {
            risk: r.authenticityRisk,
            sentiment: r.sentiment,
            confidence: r.sentimentConfidence,
          });
        }
      }
      if (overrides.size > 0) liveExecuted = true;
    } catch (err) {
      fallbackReason = classifyGeminiError(err, process.env.GEMINI_API_KEY);
    }
  }

  const benchmark = runAblationEvaluation(threshold, liveExecuted ? overrides : undefined);
  const products = await ctx.repo.listProducts(200, 0);
  const catalogForensics = computeCatalogShillForensics({
    products,
    reviews: [...ctx.catalogMemoryRepo.reviews.values()],
    analyses: ctx.catalogMemoryRepo.analyses,
  });

  return NextResponse.json({
    mode: liveExecuted ? "live_gemini" : "reference",
    geminiConfigured: liveExecuted || isGeminiKeyUsable(process.env.GEMINI_API_KEY),
    fallbackReason: liveExecuted ? undefined : fallbackReason,
    model: ctx.analysis?.model ?? DEFAULT_GEMINI_MODEL,
    runCacheTelemetry: {
      cacheHits: totalCacheHits,
      cacheMisses: totalCacheMisses,
    },
    benchmark,
    catalogForensics,
    cacheStats: getAnalysisCacheSummary(),
  });
}
