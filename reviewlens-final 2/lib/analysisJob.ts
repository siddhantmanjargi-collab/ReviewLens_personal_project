import { aggregateProduct } from "./aggregate";
import { combineRisk, heuristicSignals, ratingMismatch, type ReviewLike } from "./detector";
import { GeminiError, PROMPT_VERSION, type AnalyzeFn } from "./gemini";
import type { Repository } from "./repository";
import type { AnalysisRunRecord, NewReviewAnalysis, ProductRecord, ReviewRecord } from "./types";

export interface JobOptions {
  repo: Repository;
  analyze: AnalyzeFn;
  model: string;
  trigger: AnalysisRunRecord["trigger"];
  /** Max reviews to analyze in this run (protects your Gemini quota). */
  limit: number;
  batchSize?: number;
  maxAttempts?: number;
  /** Stop starting new batches after this many ms (keeps the run inside the function time limit). */
  budgetMs?: number;
  now?: () => number;
}

export interface JobSummary {
  runId: string;
  status: AnalysisRunRecord["status"];
  attempted: number;
  succeeded: number;
  failed: number;
  productsUpdated: number;
  stoppedBecause: string | null;
}

const toLike = (r: ReviewRecord): ReviewLike => ({ id: r.id, text: r.reviewText, title: r.reviewTitle, rating: r.rating, date: r.reviewDate });

/**
 * Analyzes pending reviews with Gemini, stores one analysis row per review (raw reviews are never
 * modified), then recomputes the product-level snapshot for every product that got new results.
 * Safe to run twice: reviews that already have an analysis for this model + prompt are skipped.
 */
export async function runAnalysisJob(o: JobOptions): Promise<JobSummary> {
  const now = o.now ?? Date.now;
  const started = now();
  const batchSize = o.batchSize ?? 10;
  const maxAttempts = o.maxAttempts ?? 3;
  const budgetMs = o.budgetMs ?? 45_000;

  const run = await o.repo.startRun({ trigger: o.trigger, model: o.model, promptVersion: PROMPT_VERSION });
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let stoppedBecause: string | null = null;
  const touched = new Set<string>();

  try {
    const pending = await o.repo.pendingReviews(o.model, PROMPT_VERSION, maxAttempts, o.limit);
    const byProduct = new Map<string, ReviewRecord[]>();
    for (const r of pending) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);

    outer: for (const [productId, reviews] of byProduct) {
      const product: ProductRecord | null = await o.repo.getProduct(productId);
      if (!product) continue;
      const siblings = (await o.repo.reviewsForProduct(productId, 500)).map(toLike);

      for (let i = 0; i < reviews.length; i += batchSize) {
        if (now() - started > budgetMs) {
          stoppedBecause = "time budget reached; remaining reviews stay pending";
          break outer;
        }
        const batch = reviews.slice(i, i + batchSize);
        attempted += batch.length;

        let outcome;
        try {
          outcome = await o.analyze({
            product: { name: product.productName, brand: product.brand, category: product.category },
            reviews: batch.map((r) => ({ id: r.id, rating: r.rating, title: r.reviewTitle, text: r.reviewText })),
          });
        } catch (err) {
          const e = err instanceof GeminiError ? err : new GeminiError("network", "Unexpected error calling Gemini.");
          if (e.transient || e.kind === "auth" || e.kind === "bad_request") {
            // Not the reviews' fault: leave them pending (no attempt counted) and stop the run.
            stoppedBecause = `${e.kind}: ${e.message}`;
            attempted -= batch.length;
            break outer;
          }
          // blocked / malformed: count an attempt against these reviews and move on.
          await o.repo.markAnalysisFailed(batch.map((r) => r.id), e.message);
          failed += batch.length;
          continue;
        }

        const rows: NewReviewAnalysis[] = [];
        for (const res of outcome.results) {
          const review = batch.find((r) => r.id === res.reviewId);
          if (!review) continue;
          const h = heuristicSignals(toLike(review), siblings);
          const mismatch = ratingMismatch(review.rating, res.sentiment, res.sentimentConfidence);
          const combined = combineRisk({ heuristicRisk: h.risk, geminiRisk: res.authenticityRisk, ratingMismatch: mismatch, signals: h.signals });
          rows.push({
            reviewId: review.id,
            model: o.model,
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
        if (rows.length > 0) {
          await o.repo.saveAnalyses(rows);
          succeeded += rows.length;
          touched.add(productId);
        }
        for (const f of outcome.failed) {
          await o.repo.markAnalysisFailed([f.reviewId], f.reason);
          failed += 1;
        }
      }
    }

    for (const productId of touched) {
      const all = await o.repo.reviewsForProduct(productId, 5000);
      const analyses = await o.repo.analysesForProduct(productId, o.model, PROMPT_VERSION);
      const agg = aggregateProduct(productId, all.length, analyses, o.model);
      await o.repo.saveProductAggregates(productId, agg.analysis, agg.aspects);
    }

    const status: AnalysisRunRecord["status"] = stoppedBecause ? "partial" : "completed";
    await o.repo.finishRun(run.id, { status, reviewsAttempted: attempted, reviewsSucceeded: succeeded, reviewsFailed: failed, note: stoppedBecause });
    return { runId: run.id, status, attempted, succeeded, failed, productsUpdated: touched.size, stoppedBecause };
  } catch (err) {
    await o.repo.finishRun(run.id, {
      status: "failed", reviewsAttempted: attempted, reviewsSucceeded: succeeded, reviewsFailed: failed,
      note: err instanceof Error ? err.message.slice(0, 300) : "unknown error",
    });
    throw err;
  }
}
