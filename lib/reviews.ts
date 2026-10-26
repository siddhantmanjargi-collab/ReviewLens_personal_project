import { createHash } from "node:crypto";
import { z } from "zod";
import type { DataSourceType, Marketplace, NewReview } from "./types";

export const rawReviewSchema = z.object({
  sourceReviewId: z.string().trim().min(1).nullish(),
  reviewTitle: z.string().trim().nullish(),
  reviewText: z.string().trim().min(3),
  rating: z.number().int().min(1).max(5),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "reviewDate must be YYYY-MM-DD")
    .nullish(),
  verifiedPurchase: z.boolean().nullish(),
  reviewerName: z.string().trim().nullish(),
  helpfulVotes: z.number().int().nonnegative().nullish(),
});

export function computeReviewHash(title: string | null | undefined, text: string, rating: number): string {
  const normalized = `${(title ?? "").trim().toLowerCase()}|${text.trim().toLowerCase().replace(/\s+/g, " ")}|${rating}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export function buildNewReview(params: {
  productId: string;
  externalId: string;
  source: Marketplace;
  dataSourceType: DataSourceType;
  raw: z.infer<typeof rawReviewSchema>;
}): NewReview {
  const isPublic = params.dataSourceType !== "user_pasted";
  const title = params.raw.reviewTitle?.trim() || null;
  const text = params.raw.reviewText.trim();
  return {
    productId: params.productId,
    externalId: params.externalId,
    source: params.source,
    sourceReviewId: params.raw.sourceReviewId?.trim() || null,
    contentHash: computeReviewHash(title, text, params.raw.rating),
    reviewTitle: title,
    reviewText: text,
    rating: params.raw.rating,
    reviewDate: params.raw.reviewDate ?? null,
    verifiedPurchase: params.raw.verifiedPurchase ?? null,
    reviewerName: params.raw.reviewerName?.trim() || null,
    helpfulVotes: params.raw.helpfulVotes ?? null,
    dataSourceType: params.dataSourceType,
    isPublic,
    retrievedAt: new Date().toISOString(),
  };
}
