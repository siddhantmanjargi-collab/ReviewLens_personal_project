import { createHash } from "node:crypto";
import { z } from "zod";
import { normalize } from "./identity";
import type { DataSourceType, NewReview, ProductRecord } from "./types";

/** Review as supplied by an acquisition source. `asin` is REQUIRED so we can prove ownership. */
export const incomingReviewSchema = z.object({
  asin: z.string(),
  sourceReviewId: z.string().trim().min(1).max(64).nullish(),
  reviewTitle: z.string().trim().max(500).nullish(),
  reviewText: z.string().trim().min(1, "review text is empty").max(20000),
  rating: z.number().int().min(1).max(5),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "reviewDate must be YYYY-MM-DD")
    .nullish(),
  verifiedPurchase: z.boolean().nullish(),
  reviewerName: z.string().trim().max(200).nullish(),
  helpfulVotes: z.number().int().min(0).nullish(),
});
export type IncomingReview = z.infer<typeof incomingReviewSchema>;

export function computeContentHash(r: {
  reviewTitle?: string | null;
  reviewText: string;
  rating: number;
  reviewDate?: string | null;
  reviewerName?: string | null;
}): string {
  const basis = [
    normalize(r.reviewTitle ?? ""),
    normalize(r.reviewText),
    String(r.rating),
    r.reviewDate ?? "",
    normalize(r.reviewerName ?? ""),
  ].join("|");
  return createHash("sha256").update(basis).digest("hex");
}

export interface ReviewRejection {
  index: number;
  reason: string;
}

export interface PreparedReviews {
  accepted: NewReview[];
  duplicatesInBatch: number;
  rejected: ReviewRejection[];
}

/**
 * Validates a batch against ONE product. A review is rejected unless its ASIN equals the
 * product's ASIN. Duplicates inside the batch are dropped. Nothing is fabricated: absent
 * optional fields stay null.
 */
export function prepareReviews(
  product: Pick<ProductRecord, "id" | "asin">,
  incoming: unknown[],
  dataSourceType: DataSourceType,
  retrievedAt: string,
): PreparedReviews {
  const accepted: NewReview[] = [];
  const rejected: ReviewRejection[] = [];
  const seenHashes = new Set<string>();
  const seenSourceIds = new Set<string>();
  let duplicatesInBatch = 0;

  incoming.forEach((raw, index) => {
    const parsed = incomingReviewSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ index, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const r = parsed.data;
    if (r.asin !== product.asin) {
      rejected.push({
        index,
        reason: `Review belongs to ASIN ${r.asin}, not product ASIN ${product.asin}.`,
      });
      return;
    }
    const contentHash = computeContentHash(r);
    const sid = r.sourceReviewId ?? null;
    if (seenHashes.has(contentHash) || (sid !== null && seenSourceIds.has(sid))) {
      duplicatesInBatch += 1;
      return;
    }
    seenHashes.add(contentHash);
    if (sid !== null) seenSourceIds.add(sid);
    accepted.push({
      productId: product.id,
      asin: product.asin,
      source: "amazon.in",
      sourceReviewId: sid,
      contentHash,
      reviewTitle: r.reviewTitle ?? null,
      reviewText: r.reviewText,
      rating: r.rating,
      reviewDate: r.reviewDate ?? null,
      verifiedPurchase: r.verifiedPurchase ?? null,
      reviewerName: r.reviewerName ?? null,
      helpfulVotes: r.helpfulVotes ?? null,
      dataSourceType,
      retrievedAt,
    });
  });

  return { accepted, duplicatesInBatch, rejected };
}
