import { NextRequest, NextResponse } from "next/server";
import { getAnalysisCacheSummary } from "@/lib/analysisCache";
import { buildContext } from "@/lib/context";
import {
  combineRisk,
  heuristicSignals,
  ratingMismatch,
  inferLexicalSentiment,
  inferFallbackAspects,
  jaccard,
  words,
} from "@/lib/detector";
import { classifyGeminiError, type GeminiFallbackReason } from "@/lib/gemini";
import type { AspectResult, Sentiment } from "@/lib/types";

export const dynamic = "force-dynamic";

interface InputBatchItem {
  title?: string;
  text: string;
  rating: number;
  verifiedPurchase?: boolean;
  reviewerName?: string;
  date?: string;
}

function shingles3(text: string): Set<string> {
  const toks = words(text);
  const out = new Set<string>();
  if (toks.length < 3) {
    if (toks.length > 0) out.add(toks.join(" "));
    return out;
  }
  for (let i = 0; i <= toks.length - 3; i++) {
    out.add(toks.slice(i, i + 3).join(" "));
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productName =
      typeof body.productName === "string" && body.productName.trim()
        ? body.productName.trim()
        : "E-Commerce Product";
    const category =
      typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Electronics";
    const rawItems: InputBatchItem[] = Array.isArray(body.reviews) ? body.reviews.slice(0, 60) : [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const validItems = rawItems
      .map((r, idx) => ({
        id: `batch-${idx + 1}`,
        title: (r.title ?? "").trim(),
        text: (r.text ?? "").trim(),
        rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))),
        verifiedPurchase: Boolean(r.verifiedPurchase ?? true),
        reviewerName: (r.reviewerName ?? `Reviewer ${idx + 1}`).trim(),
        date: typeof r.date === "string" && r.date.trim() ? r.date.trim() : todayStr,
      }))
      .filter((r) => r.text.length >= 4);

    if (validItems.length === 0) {
      return NextResponse.json({ error: "Provide at least 1 review to segregate." }, { status: 400 });
    }

    const ctx = buildContext();
    let aiPowered = false;
    let modelUsed = "heuristics-only";
    let fallbackReason: GeminiFallbackReason | undefined = ctx.analysisFallbackReason;
    let batchCacheHits = 0;
    let batchCacheMisses = 0;

    const geminiByReviewId = new Map<
      string,
      {
        sentiment: Sentiment;
        sentimentConfidence: number;
        authenticityRisk: number;
        aspects: AspectResult[];
        reasoningSignals: string[];
      }
    >();

    if (ctx.analysis) {
      try {
        const chunkSize = 12;
        for (let i = 0; i < validItems.length; i += chunkSize) {
          const chunk = validItems.slice(i, i + chunkSize);
          const outcome = await ctx.analysis.analyze({
            product: { name: productName, category },
            reviews: chunk.map((r) => ({
              id: r.id,
              rating: r.rating,
              title: r.title,
              text: r.text,
            })),
          });
          batchCacheHits += outcome.cacheHits ?? 0;
          batchCacheMisses += outcome.cacheMisses ?? 0;
          if (outcome.results.length > 0) {
            aiPowered = true;
            modelUsed = ctx.analysis.model;
            for (const res of outcome.results) {
              geminiByReviewId.set(res.reviewId, res);
            }
          }
        }
      } catch (err) {
        fallbackReason = classifyGeminiError(err, process.env.GEMINI_API_KEY);
      }
    }

    const evaluated = validItems.map((rev) => {
      const heur = heuristicSignals(rev, validItems);
      const gem = geminiByReviewId.get(rev.id);
      const sentiment: Sentiment =
        gem?.sentiment ?? inferLexicalSentiment(rev.title, rev.text, rev.rating);
      const sentimentConfidence = gem?.sentimentConfidence ?? 0.85;
      const fallbackGemRisk = Math.min(
        1,
        heur.risk + (!rev.verifiedPurchase && heur.risk >= 0.4 ? 0.15 : 0),
      );
      const geminiRisk = gem?.authenticityRisk ?? fallbackGemRisk;
      const mismatch = ratingMismatch(rev.rating, sentiment, sentimentConfidence);
      const combined = combineRisk({
        heuristicRisk: heur.risk,
        geminiRisk,
        ratingMismatch: mismatch,
        signals: heur.signals,
      });

      const bucket =
        combined.risk >= 0.66
          ? "highly_suspicious"
          : combined.risk >= 0.33
            ? "moderate_suspicion"
            : mismatch >= 0.3
              ? "rating_mismatch"
              : "genuine";

      return {
        ...rev,
        sentiment,
        sentimentConfidence,
        authenticityRisk: combined.risk,
        classification: combined.classification,
        segregationBucket: bucket,
        ratingMismatch: combined.breakdown.ratingMismatch,
        aspects: gem?.aspects ?? inferFallbackAspects(rev.title, rev.text, sentiment),
        reasoningSignals:
          gem?.reasoningSignals && gem.reasoningSignals.length > 0
            ? gem.reasoningSignals
            : heur.signals.filter((s) => s.strength > 0.25).map((s) => s.detail),
        riskBreakdown: combined.breakdown,
      };
    });

    // Detect 3-gram Jaccard near-duplicate pairs inside the uploaded batch
    const shingleSets = validItems.map((r) => shingles3(`${r.title} ${r.text}`));
    const duplicatePairs: {
      reviewerA: string;
      reviewerB: string;
      similarity: number;
    }[] = [];
    for (let i = 0; i < validItems.length; i++) {
      for (let j = i + 1; j < validItems.length; j++) {
        const sim = jaccard(shingleSets[i]!, shingleSets[j]!);
        if (sim >= 0.25) {
          duplicatePairs.push({
            reviewerA: validItems[i]!.reviewerName,
            reviewerB: validItems[j]!.reviewerName,
            similarity: Math.round(sim * 1000) / 1000,
          });
        }
      }
    }
    duplicatePairs.sort((a, b) => b.similarity - a.similarity);

    const rawAverageRating =
      Math.round((evaluated.reduce((s, r) => s + r.rating, 0) / evaluated.length) * 100) / 100;
    const genuineKeepers = evaluated.filter((r) => r.segregationBucket === "genuine");
    const genuineAverageRating =
      genuineKeepers.length > 0
        ? Math.round((genuineKeepers.reduce((s, r) => s + r.rating, 0) / genuineKeepers.length) * 100) /
          100
        : null;

    // Aggregate trusted aspects
    const aspectMap = new Map<
      string,
      { positive: number; neutral: number; negative: number; total: number }
    >();
    for (const r of genuineKeepers) {
      for (const a of r.aspects) {
        const cur = aspectMap.get(a.name) ?? { positive: 0, neutral: 0, negative: 0, total: 0 };
        cur.total += 1;
        cur[a.sentiment] += 1;
        aspectMap.set(a.name, cur);
      }
    }

    const trustedAspects = [...aspectMap.entries()]
      .map(([name, c]) => ({ name, ...c }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      aiPowered,
      fallbackReason: aiPowered ? undefined : fallbackReason,
      model: modelUsed,
      totalReviews: evaluated.length,
      rawAverageRating,
      genuineAverageRating,
      counts: {
        genuine: genuineKeepers.length,
        ratingMismatch: evaluated.filter((r) => r.segregationBucket === "rating_mismatch").length,
        moderateSuspicion: evaluated.filter((r) => r.segregationBucket === "moderate_suspicion").length,
        highlySuspicious: evaluated.filter((r) => r.segregationBucket === "highly_suspicious").length,
      },
      cacheTelemetry: {
        batchHits: batchCacheHits,
        batchMisses: batchCacheMisses,
        global: getAnalysisCacheSummary(),
      },
      duplicatePairs: duplicatePairs.slice(0, 10),
      trustedAspects,
      items: evaluated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to segregate review batch" },
      { status: 500 },
    );
  }
}
