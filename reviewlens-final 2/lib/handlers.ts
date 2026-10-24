import { z } from "zod";
import type { DataSourceType } from "./types";
import { runAnalysisJob } from "./analysisJob";
import { presentAnalysis, presentAspects } from "./aggregate";
import { PROMPT_VERSION } from "./gemini";
import { importLinkProduct, linkImportSchema } from "./linkImport";
import { importProduct } from "./productImport";
import { importReviews } from "./reviewImport";
import { isAdminAuthorized } from "./auth";
import type { RequestContext } from "./context";

export interface HandlerResult {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): HandlerResult => ({ status, body });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = () => json(400, { error: "invalid_id", detail: "id must be a UUID" });

const importProductSchema = z.object({
  url: z.string().min(1),
  productName: z.string().trim().min(1),
  brand: z.string().trim().min(1).nullish(),
  model: z.string().trim().min(1).nullish(),
});

const reviewDataSourceSchema = z.enum(["dataset", "authorized_api", "manual_import", "user_pasted", "site_user"]);

const importReviewsSchema = z.object({
  dataSourceType: reviewDataSourceSchema,
  reviews: z.array(z.unknown()).min(1).max(500),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function handleListProducts(ctx: RequestContext, query: URLSearchParams): Promise<HandlerResult> {
  const page = pageSchema.safeParse(Object.fromEntries(query));
  if (!page.success) return json(400, { error: "invalid_query", issues: page.error.issues });
  return json(200, { products: await ctx.repo.listProducts(page.data.limit, page.data.offset) });
}

export async function handleGetProduct(ctx: RequestContext, id: string): Promise<HandlerResult> {
  if (!UUID_RE.test(id)) return badId();
  const p = await ctx.repo.getProduct(id);
  return p ? json(200, { product: p }) : json(404, { error: "product_not_found" });
}

export async function handleListReviews(ctx: RequestContext, id: string, query: URLSearchParams): Promise<HandlerResult> {
  if (!UUID_RE.test(id)) return badId();
  const page = pageSchema.safeParse(Object.fromEntries(query));
  if (!page.success) return json(400, { error: "invalid_query", issues: page.error.issues });
  const p = await ctx.repo.getProduct(id);
  if (!p) return json(404, { error: "product_not_found" });
  // Public endpoint: reviews that were pasted in by a user are never returned.
  const reviews = await ctx.repo.listReviews(id, { publicOnly: true, limit: page.data.limit, offset: page.data.offset });
  return json(200, { productId: id, reviews });
}

export async function handleImportProduct(ctx: RequestContext, adminKey: string | null, body: unknown): Promise<HandlerResult> {
  if (!isAdminAuthorized(adminKey, ctx.adminApiKey)) return json(401, { error: "unauthorized" });
  const parsed = importProductSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "invalid_body", issues: parsed.error.issues });
  const outcome = await importProduct(
    { url: parsed.data.url, productName: parsed.data.productName, brand: parsed.data.brand, model: parsed.data.model },
    { repo: ctx.repo, evidence: ctx.evidence },
  );
  const v = outcome.verification;
  const verification = {
    asin: v.asin, urlStatus: v.urlStatus, urlVerified: v.urlVerified, identityVerified: v.identityVerified,
    retrievalStatus: v.retrievalStatus, dataSourceType: v.dataSourceType, reasons: v.reasons,
  };
  if (outcome.status === "rejected") return json(422, { status: "rejected", verification });
  if (outcome.status === "duplicate") return json(200, { status: "duplicate", product: outcome.product, verification });
  return json(201, { status: "created", product: outcome.product, verification });
}

export async function handleImportReviews(
  ctx: RequestContext,
  adminKey: string | null,
  productId: string,
  body: unknown,
): Promise<HandlerResult> {
  if (!isAdminAuthorized(adminKey, ctx.adminApiKey)) return json(401, { error: "unauthorized" });
  if (!UUID_RE.test(productId)) return badId();
  const parsed = importReviewsSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "invalid_body", issues: parsed.error.issues });
  const outcome = await importReviews(productId, parsed.data.reviews, parsed.data.dataSourceType as DataSourceType, { repo: ctx.repo });
  if (outcome.status === "product_not_found") return json(404, { error: "product_not_found" });
  if (outcome.status === "source_not_allowed") {
    return json(422, {
      error: "source_not_allowed",
      detail: "Unverified (link-only) products can only receive user_pasted or site_user reviews.",
    });
  }
  return json(200, outcome);
}

export async function handleImportLink(ctx: RequestContext, adminKey: string | null, body: unknown): Promise<HandlerResult> {
  if (!isAdminAuthorized(adminKey, ctx.adminApiKey)) return json(401, { error: "unauthorized" });
  const parsed = linkImportSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "invalid_body", issues: parsed.error.issues });
  const out = await importLinkProduct(parsed.data, { repo: ctx.repo });
  if (out.status === "rejected") return json(422, { status: "rejected", reason: out.reason, detail: out.detail });
  const note = "Link-only product: the link and name come from the user and have not been verified.";
  return out.status === "duplicate"
    ? json(200, { status: "duplicate", product: out.product, note })
    : json(201, { status: "created", product: out.product, note });
}

export async function handleGetAnalysis(ctx: RequestContext, productId: string): Promise<HandlerResult> {
  if (!UUID_RE.test(productId)) return badId();
  const product = await ctx.repo.getProduct(productId);
  if (!product) return json(404, { error: "product_not_found" });
  const a = await ctx.repo.getProductAnalysis(productId);
  if (!a) {
    return json(404, {
      error: "no_analysis_yet",
      detail: "Reviews are analyzed in a daily batch. Check again after the next run.",
    });
  }
  const aspects = await ctx.repo.listProductAspects(productId);
  return json(200, {
    product: {
      id: product.id, name: product.productName, source: product.source, link: product.sourceUrl,
      verificationLevel: product.verificationLevel,
      linkNote: product.urlVerified ? "Link verified." : "Link has not been verified.",
    },
    ...presentAnalysis(a, aspects),
  });
}

export async function handleGetAspects(ctx: RequestContext, productId: string): Promise<HandlerResult> {
  if (!UUID_RE.test(productId)) return badId();
  const product = await ctx.repo.getProduct(productId);
  if (!product) return json(404, { error: "product_not_found" });
  const a = await ctx.repo.getProductAnalysis(productId);
  if (!a) return json(404, { error: "no_analysis_yet" });
  return json(200, { productId, asOf: a.computedAt, dataFreshness: "daily_snapshot", aspects: presentAspects(await ctx.repo.listProductAspects(productId)) });
}

export async function handleGetReviewAnalysis(ctx: RequestContext, reviewId: string): Promise<HandlerResult> {
  if (!UUID_RE.test(reviewId)) return badId();
  const review = await ctx.repo.getReview(reviewId);
  // Private (pasted) reviews are indistinguishable from missing ones on the public API.
  if (!review || !review.isPublic) return json(404, { error: "review_not_found" });
  if (!ctx.analysis) return json(503, { error: "analysis_not_configured", missing: ctx.analysisMissing });
  const a = await ctx.repo.getReviewAnalysis(reviewId, ctx.analysis.model, PROMPT_VERSION);
  if (!a) return json(404, { error: "no_analysis_yet" });
  return json(200, {
    reviewId, asOf: a.analyzedAt, model: a.model, sentiment: a.sentiment, sentimentConfidence: a.sentimentConfidence,
    authenticityRisk: a.authenticityRisk, classification: a.authenticityClassification, aspects: a.aspects,
    reasoningSignals: a.reasoningSignals, riskBreakdown: a.riskBreakdown,
    note: "Risk is an estimate from language and pattern signals, not proof that a review is fake.",
  });
}

const analyzeBodySchema = z.object({ limit: z.number().int().min(1).max(1000).optional() }).default({});

async function startJob(ctx: RequestContext, trigger: "cron" | "manual", limit?: number): Promise<HandlerResult> {
  if (!ctx.analysis) return json(503, { error: "analysis_not_configured", missing: ctx.analysisMissing });
  const summary = await runAnalysisJob({
    repo: ctx.repo,
    analyze: ctx.analysis.analyze,
    model: ctx.analysis.model,
    trigger,
    limit: Math.min(limit ?? ctx.analysis.dailyLimit, ctx.analysis.dailyLimit),
  });
  return json(200, summary);
}

export async function handleAnalyze(ctx: RequestContext, adminKey: string | null, body: unknown): Promise<HandlerResult> {
  if (!isAdminAuthorized(adminKey, ctx.adminApiKey)) return json(401, { error: "unauthorized" });
  const parsed = analyzeBodySchema.safeParse(body ?? {});
  if (!parsed.success) return json(400, { error: "invalid_body", issues: parsed.error.issues });
  return startJob(ctx, "manual", parsed.data.limit);
}

export async function handleCron(ctx: RequestContext, authorization: string | null): Promise<HandlerResult> {
  if (!ctx.cronSecret) return json(503, { error: "cron_not_configured", detail: "Set CRON_SECRET (16+ characters) in Vercel." });
  if (!isAdminAuthorized(authorization, `Bearer ${ctx.cronSecret}`)) return json(401, { error: "unauthorized" });
  return startJob(ctx, "cron");
}

const importLinksSchema = z.object({ items: z.array(z.unknown()).min(1).max(100) });

/** Bulk version of import-link: one request can add up to 100 link-only products. */
export async function handleImportLinks(ctx: RequestContext, adminKey: string | null, body: unknown): Promise<HandlerResult> {
  if (!isAdminAuthorized(adminKey, ctx.adminApiKey)) return json(401, { error: "unauthorized" });
  const parsed = importLinksSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "invalid_body", issues: parsed.error.issues });
  const results: unknown[] = [];
  const counts = { created: 0, duplicate: 0, rejected: 0 };
  for (const [index, raw] of parsed.data.items.entries()) {
    const item = linkImportSchema.safeParse(raw);
    if (!item.success) {
      counts.rejected += 1;
      results.push({ index, status: "rejected", reason: "invalid_item", detail: item.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      continue;
    }
    const out = await importLinkProduct(item.data, { repo: ctx.repo });
    if (out.status === "rejected") {
      counts.rejected += 1;
      results.push({ index, status: "rejected", reason: out.reason, detail: out.detail });
    } else {
      counts[out.status] += 1;
      results.push({ index, status: out.status, productId: out.product.id, source: out.product.source, externalId: out.product.externalId });
    }
  }
  return json(200, { counts, results });
}
