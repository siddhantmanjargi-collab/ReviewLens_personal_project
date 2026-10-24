import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/lib/memoryRepository";
import type { RequestContext } from "@/lib/context";
import {
  handleAnalyze, handleCron, handleGetAnalysis, handleGetAspects, handleGetReviewAnalysis,
  handleImportLink, handleImportLinks, handleImportReviews, handleListReviews,
} from "@/lib/handlers";
import { AMAZON_LINK, FLIPKART_LINK, fakeAnalyze } from "./helpers";

const KEY = "test-admin-key-123";
const CRON = "cron-secret-0123456789";
const MODEL = "model-a";

function ctx(over: Partial<RequestContext> = {}): RequestContext & { repo: MemoryRepository } {
  const repo = new MemoryRepository();
  return {
    repo, evidence: { retrieve: async () => { throw new Error("not used"); } }, adminApiKey: KEY,
    analysis: { analyze: fakeAnalyze(), model: MODEL, dailyLimit: 50 }, analysisMissing: [], cronSecret: CRON, ...over,
  } as RequestContext & { repo: MemoryRepository };
}
const idOf = (r: { body: unknown }) => (r.body as { product: { id: string } }).product.id;

async function productWith(c: ReturnType<typeof ctx>, link = AMAZON_LINK) {
  const created = await handleImportLink(c, KEY, { link, productName: "Acme Nova X1" });
  return idOf(created);
}

describe("import-link", () => {
  it("needs the admin key and a valid body", async () => {
    const c = ctx();
    expect((await handleImportLink(c, null, { link: AMAZON_LINK, productName: "Acme" })).status).toBe(401);
    expect((await handleImportLink(c, KEY, { link: AMAZON_LINK })).status).toBe(400);
  });
  it("creates 201, repeats as 200 duplicate, and explains rejections with 422", async () => {
    const c = ctx();
    const a = await handleImportLink(c, KEY, { link: FLIPKART_LINK, productName: "Acme Nova" });
    expect(a.status).toBe(201);
    expect((a.body as { note: string }).note).toMatch(/not been verified/);
    expect((await handleImportLink(c, KEY, { link: FLIPKART_LINK, productName: "Acme Nova" })).status).toBe(200);
    const bad = await handleImportLink(c, KEY, { link: "https://dl.flipkart.com/s/abc", productName: "Acme" });
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({ reason: "short_link" });
  });
  it("bulk import reports each item and never aborts the whole batch", async () => {
    const c = ctx();
    const r = await handleImportLinks(c, KEY, { items: [
      { link: AMAZON_LINK, productName: "Acme One" },
      { link: AMAZON_LINK, productName: "Acme One again" },
      { link: "https://www.amazon.in/s?k=x", productName: "Search page" },
      { productName: "no link" },
    ] });
    expect(r.status).toBe(200);
    expect((r.body as { counts: object }).counts).toEqual({ created: 1, duplicate: 1, rejected: 2 });
    expect((await handleImportLinks(c, null, { items: [] })).status).toBe(401);
    expect((await handleImportLinks(c, KEY, { items: [] })).status).toBe(400);
  });
});

describe("privacy of pasted reviews", () => {
  it("link-only products accept pasted/site reviews but not dataset ones", async () => {
    const c = ctx();
    const id = await productWith(c);
    const reviews = [{ reviewText: "Battery lasted two days for me.", rating: 4 }];
    expect((await handleImportReviews(c, KEY, id, { dataSourceType: "dataset", reviews })).status).toBe(422);
    expect((await handleImportReviews(c, KEY, id, { dataSourceType: "user_pasted", reviews })).status).toBe(200);
  });
  it("the public review list never returns pasted reviews but does return site reviews", async () => {
    const c = ctx();
    const id = await productWith(c);
    await handleImportReviews(c, KEY, id, { dataSourceType: "user_pasted", reviews: [{ reviewText: "pasted review text about the phone", rating: 3 }] });
    await handleImportReviews(c, KEY, id, { dataSourceType: "site_user", reviews: [{ reviewText: "written on our own site about the phone", rating: 5 }] });
    const list = await handleListReviews(c, id, new URLSearchParams());
    const texts = (list.body as { reviews: { reviewText: string }[] }).reviews.map((r) => r.reviewText);
    expect(texts).toEqual(["written on our own site about the phone"]);
  });
  it("a pasted review's analysis is not available on the public API", async () => {
    const c = ctx();
    const id = await productWith(c);
    await handleImportReviews(c, KEY, id, { dataSourceType: "user_pasted", reviews: [{ reviewText: "pasted review text about the phone", rating: 3 }] });
    const reviewId = [...c.repo.reviews.keys()][0]!;
    expect((await handleGetReviewAnalysis(c, reviewId)).status).toBe(404);
  });
});

describe("analysis endpoints", () => {
  it("says 'no analysis yet' before the job and returns a labelled snapshot after it", async () => {
    const c = ctx();
    const id = await productWith(c);
    await handleImportReviews(c, KEY, id, { dataSourceType: "site_user", reviews: [
      { reviewText: "Battery lasted two days with normal use", rating: 5 },
      { reviewText: "Battery drains in a few hours and charging is slow", rating: 1 },
    ] });
    expect((await handleGetAnalysis(c, id)).status).toBe(404);
    expect((await handleAnalyze(c, KEY, {})).status).toBe(200);
    const res = await handleGetAnalysis(c, id);
    expect(res.status).toBe(200);
    const body = res.body as { dataFreshness: string; reviewsAnalyzed: number; sentiment: { positive: { percent: number } }; product: { linkNote: string } };
    expect(body.dataFreshness).toBe("daily_snapshot");
    expect(body.reviewsAnalyzed).toBe(2);
    expect(body.sentiment.positive.percent).toBe(50);
    expect(body.product.linkNote).toMatch(/not been verified/);
    const aspects = await handleGetAspects(c, id);
    expect((aspects.body as { aspects: { name: string }[] }).aspects[0]!.name).toBe("battery");
    const reviewId = [...c.repo.reviews.keys()][0]!;
    expect((await handleGetReviewAnalysis(c, reviewId)).status).toBe(200);
  });
  it("validates ids and unknown products", async () => {
    const c = ctx();
    expect((await handleGetAnalysis(c, "nope")).status).toBe(400);
    expect((await handleGetAnalysis(c, "11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });
});

describe("running the job", () => {
  it("manual runs need the admin key and Gemini configuration", async () => {
    expect((await handleAnalyze(ctx(), null, {})).status).toBe(401);
    const unconfigured = await handleAnalyze(ctx({ analysis: null, analysisMissing: ["GEMINI_API_KEY"] }), KEY, {});
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body).toMatchObject({ error: "analysis_not_configured", missing: ["GEMINI_API_KEY"] });
  });
  it("the cron endpoint is disabled without a secret and rejects wrong ones", async () => {
    expect((await handleCron(ctx({ cronSecret: null }), `Bearer ${CRON}`)).status).toBe(503);
    expect((await handleCron(ctx(), null)).status).toBe(401);
    expect((await handleCron(ctx(), "Bearer wrong-secret-0123456")).status).toBe(401);
    expect((await handleCron(ctx(), `Bearer ${CRON}`)).status).toBe(200);
  });
  it("cannot be asked to exceed the configured daily limit", async () => {
    const calls: number[] = [];
    const c = ctx({ analysis: { analyze: async (i) => { calls.push(i.reviews.length); return fakeAnalyze()(i); }, model: MODEL, dailyLimit: 3 } });
    const id = await productWith(c);
    await handleImportReviews(c, KEY, id, { dataSourceType: "site_user", reviews: Array.from({ length: 8 }, (_, i) => ({ reviewText: `Review number ${i} about battery and screen`, rating: 4 })) });
    await handleAnalyze(c, KEY, { limit: 500 });
    expect(calls.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
