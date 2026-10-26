import { NextResponse } from "next/server";
import { z } from "zod";
import { readSessionFromRequest } from "@/lib/auth";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { buildContext } from "@/lib/context";
import { resolveSupabaseUserWithClient } from "@/lib/supabase/server";
import type { NewProduct, ProductAspectRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  marketplace: z.enum(["amazon.in", "flipkart", "web"]),
  externalId: z.string().trim().min(2).max(64),
  productName: z.string().trim().min(2).max(240),
  brand: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(60).optional(),
  summary: z.string().trim().max(1200).nullable().optional(),
  imageUrl: z.string().trim().max(600).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  mrp: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().max(8).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),
  availability: z.string().trim().max(80).nullable().optional(),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sourceUrl: z.string().url(),
  reliabilityScore: z.number().min(0).max(100),
  analysisMode: z.enum(["live_grounded", "local_heuristic"]).optional(),
  pros: z.array(z.string()).max(8).optional(),
  cons: z.array(z.string()).max(8).optional(),
});

export async function POST(req: Request) {
  const supabaseCtx = await resolveSupabaseUserWithClient(req);
  const localSession = supabaseCtx ? null : readSessionFromRequest(req);
  if (!supabaseCtx && !localSession) {
    return NextResponse.json(
      { ok: false, error: "Please sign in to save analyzed products." },
      { status: 401 },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid analyzed product payload." },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const ctx = buildContext();

  const existing = await ctx.repo.findProduct(d.marketplace, d.externalId);
  if (existing) {
    return NextResponse.json({ ok: true, status: "existing", product: existing }, { status: 200 });
  }

  const price = d.price ?? null;
  const mrp = d.mrp && price && d.mrp > price ? d.mrp : null;
  const discountPercent =
    price !== null && mrp !== null ? Math.round(((mrp - price) / mrp) * 100) : null;

  const newProduct: NewProduct = {
    source: d.marketplace,
    externalId: d.externalId,
    verificationLevel: d.analysisMode === "live_grounded" ? "ai_grounded" : "link_only",
    productName: d.productName,
    brand: d.brand ?? null,
    manufacturer: d.brand ?? null,
    model: d.model ?? null,
    category: d.category || "Accessories",
    deviceType: d.category || "Electronics",
    description: d.summary ?? null,
    imageUrl: d.imageUrl ?? null,
    price,
    mrp,
    discountPercent,
    currency: d.currency || "INR",
    rating: d.rating ?? null,
    reviewCount: d.reviewCount ?? 0,
    availability: d.availability || "Check Storefront",
    specs: d.specs ?? {},
    unavailableFields: [],
    sourceUrl: d.sourceUrl,
    canonicalUrl: d.sourceUrl,
    urlVerified: false,
    urlVerificationStatus: "not_checked",
    identityVerified: d.analysisMode === "live_grounded",
    retrievalStatus: "live",
    dataSourceType: "live_retrieval",
    lastCheckedAt: new Date().toISOString(),
  };

  let created;
  try {
    created = await ctx.repo.insertProduct(newProduct);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not save analyzed product." },
      { status: 500 },
    );
  }

  // Seed initial product aggregate snapshot from the Link Analyzer reliability score & pros/cons
  const avgRisk = Math.max(0.04, Math.min(0.82, Math.round((1 - d.reliabilityScore / 100) * 100) / 100));
  const syntheticAspects: Omit<ProductAspectRecord, "productId">[] = [];
  for (const pro of (d.pros ?? []).slice(0, 2)) {
    const shortAspect = pro.split(/[:(—–-]/)[0]!.trim().slice(0, 32);
    if (shortAspect.length >= 3) {
      syntheticAspects.push({
        aspectName: shortAspect,
        mentionCount: 4,
        positiveCount: 4,
        neutralCount: 0,
        negativeCount: 0,
      });
    }
  }
  for (const con of (d.cons ?? []).slice(0, 2)) {
    const shortAspect = con.split(/[:(—–-]/)[0]!.trim().slice(0, 32);
    if (shortAspect.length >= 3) {
      syntheticAspects.push({
        aspectName: shortAspect,
        mentionCount: 3,
        positiveCount: 1,
        neutralCount: 0,
        negativeCount: 2,
      });
    }
  }

  try {
    await ctx.repo.saveProductAggregates(
      created.id,
      {
        productId: created.id,
        reviewsTotal: d.reviewCount ?? 0,
        reviewsAnalyzed: syntheticAspects.length > 0 ? 6 : 1,
        positiveCount: d.reliabilityScore >= 75 ? 5 : 3,
        neutralCount: 1,
        negativeCount: d.reliabilityScore >= 75 ? 0 : 2,
        avgSentimentConfidence: 0.85,
        authenticityDistribution: {
          low_suspicion: d.reliabilityScore >= 75 ? 5 : 3,
          moderate_suspicion: d.reliabilityScore >= 52 ? 1 : 2,
          highly_suspicious: d.reliabilityScore < 52 ? 2 : 0,
        },
        details: {
          averageRisk: avgRisk,
          rawAverageRating: d.rating ?? 4.2,
          genuineAverageRating: d.rating ?? 4.2,
          ratingDelta: 0,
        },
        model: DEFAULT_GEMINI_MODEL,
      },
      syntheticAspects,
    );
  } catch {
    // Non-fatal if aggregate write is skipped
  }

  return NextResponse.json({ ok: true, status: "created", product: created }, { status: 201 });
}
