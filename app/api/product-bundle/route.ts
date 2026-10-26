import { NextRequest, NextResponse } from "next/server";
import { presentAnalysis } from "@/lib/aggregate";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { buildContext } from "@/lib/context";
import { computeProductClusterForensics } from "@/lib/forensics";
import { PROMPT_VERSION } from "@/lib/gemini";
import type { ReviewAnalysisRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const productId = req.nextUrl.searchParams.get("productId") ?? req.nextUrl.searchParams.get("id") ?? "";
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const product = await ctx.repo.getProduct(productId);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const model = ctx.analysis?.model ?? DEFAULT_GEMINI_MODEL;
  const [reviews, analysisRecord, aspects, analysesList] = await Promise.all([
    ctx.repo.listReviews(product.id, { limit: 100, offset: 0, publicOnly: true }),
    ctx.repo.getProductAnalysis(product.id),
    ctx.repo.listProductAspects(product.id),
    ctx.repo.analysesForProduct(product.id, model, PROMPT_VERSION),
  ]);

  const reviewAnalyses: Record<string, ReviewAnalysisRecord> = {};
  for (const a of analysesList) {
    reviewAnalyses[a.reviewId] = a;
  }

  // Merge catalog memory reviews + current product reviews for cross-product shill/duplicate forensics
  const allProducts = await ctx.repo.listProducts(200, 0);
  const memReviews = [...ctx.catalogMemoryRepo.reviews.values()];
  const seenRevIds = new Set(reviews.map((r) => r.id));
  const allReviews = [...reviews, ...memReviews.filter((r) => !seenRevIds.has(r.id))];

  const analysisByReviewId = new Map<string, ReviewAnalysisRecord>();
  for (const a of ctx.catalogMemoryRepo.analyses) {
    analysisByReviewId.set(a.reviewId, a);
  }
  for (const a of analysesList) {
    analysisByReviewId.set(a.reviewId, a);
  }

  const clusterForensics = computeProductClusterForensics({
    productId: product.id,
    productReviews: reviews,
    allProducts,
    allReviews,
    analysisByReviewId,
  });

  return NextResponse.json({
    product,
    summary: analysisRecord ? presentAnalysis(analysisRecord, aspects) : null,
    reviews,
    reviewAnalyses,
    clusterForensics,
  });
}
