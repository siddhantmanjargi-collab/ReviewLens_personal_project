import { describe, expect, it } from "vitest";
import { runAnalysisJob } from "@/lib/analysisJob";
import { GeminiError, PROMPT_VERSION, type AnalyzeFn } from "@/lib/gemini";
import { MemoryRepository } from "@/lib/memoryRepository";
import { addPasted, fakeAnalyze, makeLinkProduct } from "./helpers";

const base = (repo: MemoryRepository, analyze: AnalyzeFn, over: object = {}) =>
  runAnalysisJob({ repo, analyze, model: "model-a", trigger: "manual", limit: 100, ...over });

async function setup(n = 3) {
  const repo = new MemoryRepository();
  const product = await makeLinkProduct(repo);
  await addPasted(repo, product.id, Array.from({ length: n }, (_, i) => ({ text: `Review ${i}: battery lasted ${i + 2} days on my phone`, rating: i % 2 ? 2 : 5 })));
  return { repo, product };
}

describe("runAnalysisJob", () => {
  it("analyzes pending reviews, stores per-review results and writes the product snapshot", async () => {
    const { repo, product } = await setup(3);
    const s = await base(repo, fakeAnalyze());
    expect(s).toMatchObject({ status: "completed", attempted: 3, succeeded: 3, failed: 0, productsUpdated: 1 });
    expect(repo.analyses).toHaveLength(3);
    const agg = await repo.getProductAnalysis(product.id);
    expect(agg).toMatchObject({ reviewsTotal: 3, reviewsAnalyzed: 3, positiveCount: 2, negativeCount: 1 });
    expect((await repo.listProductAspects(product.id))[0]).toMatchObject({ aspectName: "battery", mentionCount: 3 });
  });

  it("is idempotent: a second run analyzes nothing", async () => {
    const { repo } = await setup(2);
    await base(repo, fakeAnalyze());
    const again = await base(repo, fakeAnalyze());
    expect(again).toMatchObject({ attempted: 0, succeeded: 0, productsUpdated: 0, status: "completed" });
    expect(repo.analyses).toHaveLength(2);
  });

  it("never modifies the raw reviews, and re-analysis with another model keeps both results", async () => {
    const { repo } = await setup(2);
    const before = JSON.stringify([...repo.reviews.values()]);
    await base(repo, fakeAnalyze());
    expect(JSON.stringify([...repo.reviews.values()])).toBe(before);
    await base(repo, fakeAnalyze({ risk: 0.5 }), { model: "model-b" });
    expect(repo.analyses).toHaveLength(4);
    expect(new Set(repo.analyses.map((x) => x.model))).toEqual(new Set(["model-a", "model-b"]));
    expect(JSON.stringify([...repo.reviews.values()])).toBe(before);
  });

  it("respects the limit and the batch size", async () => {
    const { repo } = await setup(5);
    const calls: number[] = [];
    const analyze: AnalyzeFn = async (input) => { calls.push(input.reviews.length); return fakeAnalyze()(input); };
    const s = await base(repo, analyze, { limit: 4, batchSize: 3 });
    expect(s.attempted).toBe(4);
    expect(calls).toEqual([3, 1]);
  });

  it("combines Gemini's score with the heuristics and keeps the breakdown", async () => {
    const { repo } = await setup(1);
    await base(repo, fakeAnalyze({ risk: 0.9 }));
    const a = repo.analyses[0]!;
    expect(a.authenticityRisk).toBeGreaterThanOrEqual(0);
    expect(a.authenticityRisk).toBeLessThanOrEqual(1);
    expect(a.riskBreakdown.geminiRisk).toBe(0.9);
    expect(a.riskBreakdown.signals.length).toBeGreaterThan(0);
    expect(a.promptVersion).toBe(PROMPT_VERSION);
  });

  it("a rate limit stops the run, leaves reviews pending and does not count an attempt against them", async () => {
    const { repo } = await setup(3);
    const s = await base(repo, async () => { throw new GeminiError("rate_limited", "quota"); });
    expect(s.status).toBe("partial");
    expect(s.stoppedBecause).toMatch(/rate_limited/);
    expect(s.attempted).toBe(0);
    expect([...repo.reviews.values()].every((r) => r.analysisAttempts === 0)).toBe(true);
    expect(await repo.pendingReviews("model-a", PROMPT_VERSION, 3, 10)).toHaveLength(3);
    expect([...repo.runs.values()][0]!.status).toBe("partial");
  });

  it("a bad API key stops the run too", async () => {
    const { repo } = await setup(2);
    const s = await base(repo, async () => { throw new GeminiError("auth", "bad key"); });
    expect(s.status).toBe("partial");
    expect(repo.analyses).toHaveLength(0);
  });

  it("malformed output counts an attempt, and a review is dropped from the queue after 3 attempts", async () => {
    const { repo } = await setup(1);
    const bad: AnalyzeFn = async (input) => ({ results: [], failed: input.reviews.map((r) => ({ reviewId: r.id, reason: "Invalid result" })) });
    for (let i = 0; i < 3; i++) await base(repo, bad);
    const r = [...repo.reviews.values()][0]!;
    expect(r.analysisAttempts).toBe(3);
    expect(r.lastAnalysisError).toBe("Invalid result");
    expect(await repo.pendingReviews("model-a", PROMPT_VERSION, 3, 10)).toHaveLength(0);
    expect(repo.analyses).toHaveLength(0);
  });

  it("keeps good results from a batch even when another review in it failed", async () => {
    const { repo } = await setup(2);
    const analyze: AnalyzeFn = async (input) => {
      const ok = await fakeAnalyze()(input);
      return { results: ok.results.slice(0, 1), failed: [{ reviewId: input.reviews[1]!.id, reason: "skipped" }] };
    };
    const s = await base(repo, analyze);
    expect(s).toMatchObject({ succeeded: 1, failed: 1 });
    expect((await repo.getProductAnalysis([...repo.products.keys()][0]!))!.reviewsAnalyzed).toBe(1);
  });

  it("stops starting new batches when the time budget is used up", async () => {
    const { repo } = await setup(4);
    let t = 0;
    const s = await base(repo, fakeAnalyze(), { batchSize: 2, budgetMs: 100, now: () => (t += 60) });
    expect(s.status).toBe("partial");
    expect(s.stoppedBecause).toMatch(/time budget/);
    expect(s.succeeded).toBeGreaterThan(0);
    expect(s.succeeded).toBeLessThan(4);
  });

  it("records the run in the log, including failures", async () => {
    const { repo } = await setup(1);
    await base(repo, fakeAnalyze());
    expect([...repo.runs.values()][0]).toMatchObject({ status: "completed", reviewsSucceeded: 1, trigger: "manual" });
    const broken = new MemoryRepository();
    broken.pendingReviews = async () => { throw new Error("db down"); };
    await expect(base(broken, fakeAnalyze())).rejects.toThrow("db down");
    expect([...broken.runs.values()][0]).toMatchObject({ status: "failed", note: "db down" });
  });
});
