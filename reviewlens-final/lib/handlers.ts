import { z } from "zod";
import type { DataSourceType } from "./types";
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

const reviewDataSourceSchema = z.enum(["dataset", "authorized_api", "manual_import"]);

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
  return json(200, { productId: id, reviews: await ctx.repo.listReviews(id, page.data.limit, page.data.offset) });
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
  return json(200, outcome);
}
