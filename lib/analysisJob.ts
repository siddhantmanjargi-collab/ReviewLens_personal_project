import type { NewReviewAnalysis, ReviewRecord } from "./types";
import type { Repository } from "./repository";
import { computeProductAggregates } from "./aggregate";
import { combineRisk, heuristicSignals, ratingMismatch } from "./detector";
import { GeminiError, PROMPT_VERSION, type AnalyzeFn } from "./gemini";

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const TIME_BUDGET_MS = 45_000;

export interface AnalysisJobSummary {
  runId: string;
  status: "completed" | "partial" | "failed";
  reviewsAttempted: number;
  reviewsSucceeded: number;
  reviewsFailed: number;
  productsUpdated: number;
  note: string | null;
}

export async function runAnalysisJob(params: {
  repo: Repository;
  analyze: AnalyzeFn;
  model: string;
  trigger: "cron" | "manual";
  limit: number;
}): Promise<AnalysisJobSummary> {
  const started = Date.now();
  const run = await params.repo.startRun({
    trigger: params.trigger,
    model: params.model,
    promptVersion: PROMPT_VERSION,
  });

  const pending = await params.repo.pendingReviews(params.model, PROMPT_VERSION, MAX_ATTEMPTS, params.limit);
  if (pending.length === 0) {
    const note = "No pending reviews needed analysis for current model.";
    await params.repo.finishRun(run.id, {
      status: "completed",
      reviewsAttempted: 0,
      reviewsSucceeded: 0,
      reviewsFailed: 0,
      note,
    });
    return {
      runId: run.id,
      status: "completed",
      reviewsAttempted: 0,
      reviewsSucceeded: 0,
      reviewsFailed: 0,
      productsUpdated: 0,
      note,
    };
  }

  const byProduct = new Map<string, ReviewRecord[]>();
  for (const r of pending) {
    const arr = byProduct.get(r.productId) ?? [];
    arr.push(r);
    byProduct.set(r.productId, arr);
  }

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let status: "completed" | "partial" | "failed" = "completed";
  let note: string | null = null;
  const touchedProducts = new Set<string>();

  outer: for (const [productId, list] of byProduct) {
    const product = await params.repo.getProduct(productId);
    if (!product) continue;
    const allProductReviews = await params.repo.reviewsForProduct(productId, 200);
    const siblings = allProductReviews.map((r) => ({
      id: r.id,
      text: r.reviewText,
      title: r.reviewTitle,
      rating: r.rating,
      date: r.reviewDate,
    }));

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        status = "partial";
        note = "Stopped cleanly at 45s time budget; remaining reviews stay pending.";
        break outer;
      }

      const batch = list.slice(i, i + BATCH_SIZE);
      attempted += batch.length;

      try {
        const outcome = await params.analyze({
          product: { name: product.productName, brand: product.brand, category: product.category },
          reviews: batch.map((r) => ({ id: r.id, rating: r.rating, title: r.reviewTitle, text: r.reviewText })),
        });

        const toSave: NewReviewAnalysis[] = [];
        for (const res of outcome.results) {
          const rev = batch.find((b) => b.id === res.reviewId);
          if (!rev) continue;
          const heur = heuristicSignals(
            { id: rev.id, text: rev.reviewText, title: rev.reviewTitle, rating: rev.rating, date: rev.reviewDate },
            siblings,
          );
          const mismatch = ratingMismatch(rev.rating, res.sentiment, res.sentimentConfidence);
          const combined = combineRisk({
            heuristicRisk: heur.risk,
            geminiRisk: res.authenticityRisk,
            ratingMismatch: mismatch,
            signals: heur.signals,
          });
          toSave.push({
            reviewId: rev.id,
            model: params.model,
            promptVersion: PROMPT_VERSION,
            sentiment: res.sentiment,
            sentimentConfidence: res.sentimentConfidence,
            authenticityRisk: combined.risk,
            authenticityClassification: combined.classification,
            aspects: res.aspects,
            reasoningSignals: res.reasoningSignals,
            riskBreakdown: combined.breakdown,
          });
        }

        if (toSave.length > 0) {
          await params.repo.saveAnalyses(toSave);
          succeeded += toSave.length;
          touchedProducts.add(productId);
        }

        if (outcome.failed.length > 0) {
          failed += outcome.failed.length;
          for (const f of outcome.failed) {
            await params.repo.markAnalysisFailed([f.reviewId], f.reason);
          }
        }
      } catch (err) {
        if (err instanceof GeminiError && (err.transient || err.kind === "auth" || err.kind === "bad_request")) {
          status = succeeded > 0 ? "partial" : "failed";
          note = err.message;
          break outer;
        }
        const msg = err instanceof Error ? err.message : "Unknown batch failure";
        failed += batch.length;
        await params.repo.markAnalysisFailed(
          batch.map((b) => b.id),
          msg,
        );
      }
    }
  }

  for (const productId of touchedProducts) {
    const allRevs = await params.repo.reviewsForProduct(productId, 1000);
    const analyses = await params.repo.analysesForProduct(productId, params.model, PROMPT_VERSION);
    const agg = computeProductAggregates(productId, allRevs.length, analyses, params.model, allRevs);
    await params.repo.saveProductAggregates(productId, agg.analysis, agg.aspects);
  }

  await params.repo.finishRun(run.id, {
    status,
    reviewsAttempted: attempted,
    reviewsSucceeded: succeeded,
    reviewsFailed: failed,
    note,
  });

  return {
    runId: run.id,
    status,
    reviewsAttempted: attempted,
    reviewsSucceeded: succeeded,
    reviewsFailed: failed,
    productsUpdated: touchedProducts.size,
    note,
  };
}
