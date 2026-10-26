import type { DataSourceType } from "./types";
import type { Repository } from "./repository";
import { buildNewReview, rawReviewSchema } from "./reviews";

export type ImportReviewsOutcome =
  | { status: "product_not_found" }
  | { status: "source_not_allowed" }
  | {
      status: "imported";
      productId: string;
      received: number;
      inserted: number;
      duplicatesInPayload: number;
      duplicatesInDatabase: number;
      rejected: { index: number; reason: string }[];
    };

export async function importReviews(
  productId: string,
  rawList: unknown[],
  dataSourceType: DataSourceType,
  deps: { repo: Repository },
): Promise<ImportReviewsOutcome> {
  const product = await deps.repo.getProduct(productId);
  if (!product) return { status: "product_not_found" };

  if (
    product.verificationLevel !== "verified" &&
    dataSourceType !== "user_pasted" &&
    dataSourceType !== "site_user"
  ) {
    return { status: "source_not_allowed" };
  }

  const seenHashes = new Set<string>();
  const seenSourceIds = new Set<string>();
  const valid = [];
  const rejected: { index: number; reason: string }[] = [];
  let duplicatesInPayload = 0;

  for (const [index, item] of rawList.entries()) {
    const parsed = rawReviewSchema.safeParse(item);
    if (!parsed.success) {
      rejected.push({
        index,
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    const candidate = buildNewReview({
      productId: product.id,
      externalId: product.externalId,
      source: product.source,
      dataSourceType,
      raw: parsed.data,
    });

    if (
      seenHashes.has(candidate.contentHash) ||
      (candidate.sourceReviewId && seenSourceIds.has(candidate.sourceReviewId))
    ) {
      duplicatesInPayload += 1;
      continue;
    }
    seenHashes.add(candidate.contentHash);
    if (candidate.sourceReviewId) seenSourceIds.add(candidate.sourceReviewId);
    valid.push(candidate);
  }

  const dbRes = await deps.repo.insertReviews(valid);
  return {
    status: "imported",
    productId: product.id,
    received: rawList.length,
    inserted: dbRes.inserted,
    duplicatesInPayload,
    duplicatesInDatabase: dbRes.duplicatesInDatabase,
    rejected,
  };
}
