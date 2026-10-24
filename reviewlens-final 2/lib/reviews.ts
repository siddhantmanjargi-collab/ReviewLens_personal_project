import { createHash } from "node:crypto";
import { z } from "zod";
import { normalize } from "./identity";
import type { DataSourceType, NewReview, ProductRecord } from "./types";

/**
 * Review as supplied by a source. `externalId` (ASIN / pid) lets a source prove which product the
 * review belongs to. It is REQUIRED for dataset / API / manual imports, and optional for
 * user_pasted / site_user reviews (where the product comes from the request itself).
 */
export const incomingReviewSchema = z.object({
  externalId: z.string().trim().min(1).max(32).nullish(),
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

const USER_ORIGINS: DataSourceType[] = ["user_pasted", "site_user"];

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
  product: Pick<ProductRecord, "id" | "externalId" | "source">,
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
    if (r.externalId) {
      if (r.externalId !== product.externalId) {
        rejected.push({
          index,
          reason: `Review belongs to product ${r.externalId}, not product ${product.externalId}.`,
        });
        return;
      }
    } else if (!USER_ORIGINS.includes(dataSourceType)) {
      rejected.push({ index, reason: "externalId is required so the review can be tied to its product." });
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
      externalId: product.externalId,
      source: product.source,
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
      // Reviews a user pasted in from elsewhere are used for analysis only; never served publicly.
      isPublic: dataSourceType !== "user_pasted",
      retrievedAt,
    });
  });

  return { accepted, duplicatesInBatch, rejected };
}
